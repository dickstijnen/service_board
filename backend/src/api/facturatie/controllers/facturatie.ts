import PDFDocument from 'pdfkit'

export default {
  async teFactureren(ctx: any) {
    const opdrachten = await strapi.entityService.findMany('api::opdracht.opdracht', {
      filters: {
        status: { $in: ['opgehaald', 'gewisseld'] },
        factuur: { id: { $null: true } },
      },
      populate: ['klant', 'container'],
    })
    ctx.body = opdrachten
  },

  async preview(ctx: any) {
    const { opdracht_id } = ctx.params
    const opdracht = await strapi.entityService.findOne('api::opdracht.opdracht', opdracht_id, {
      populate: ['klant', 'container'],
    }) as any

    if (!opdracht) return ctx.notFound('Opdracht niet gevonden')

    let prijs = 0
    if (opdracht.container?.formaat && opdracht.afval_soort) {
      const tarieven = await strapi.entityService.findMany('api::tarief.tarief', {
        filters: {
          formaat: opdracht.container.formaat,
          afval_soort: opdracht.afval_soort,
        },
        limit: 1,
      }) as any[]
      prijs = tarieven[0]?.prijs ?? 0
    }

    if (opdracht.klant?.speciaal_tarief) {
      // Speciaal tarief: 10% korting als richtlijn
      prijs = prijs * 0.9
    }

    const extra_huur_bedrag = opdracht.extra_huur_actief
      ? (opdracht.extra_huur_dagen ?? 0) * 15
      : 0

    const subtotaal = prijs + extra_huur_bedrag
    const btw_bedrag = subtotaal * 0.21
    const totaal = subtotaal + btw_bedrag

    ctx.body = {
      transport_bedrag: prijs,
      extra_huur_bedrag,
      subtotaal,
      btw_bedrag: Math.round(btw_bedrag * 100) / 100,
      totaal: Math.round(totaal * 100) / 100,
      speciaal_tarief_toegepast: opdracht.klant?.speciaal_tarief ?? false,
    }
  },

  async pdf(ctx: any) {
    const factuur = await strapi.entityService.findOne('api::factuur.factuur', ctx.params.id, {
      populate: ['klant', 'opdracht'],
    }) as any

    if (!factuur) return ctx.notFound('Factuur niet gevonden')

    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []
    doc.on('data', (chunk: Buffer) => buffers.push(chunk))

    await new Promise<void>((resolve) => {
      doc.on('end', resolve)

      doc.fontSize(20).text('PaterBak', { align: 'right' })
      doc.fontSize(12).text(`Factuur ${factuur.factuur_nummer}`, { align: 'right' })
      doc.moveDown()
      doc.text(`Klant: ${factuur.klant?.bedrijfsnaam ?? ''}`)
      doc.text(`Datum: ${factuur.factuurdatum ?? ''}`)
      doc.text(`Vervaldatum: ${factuur.vervaldatum ?? ''}`)
      doc.moveDown()
      doc.text(`Subtotaal: €${factuur.subtotaal ?? 0}`)
      doc.text(`BTW (21%): €${factuur.btw_bedrag ?? 0}`)
      doc.fontSize(14).text(`Totaal: €${factuur.totaal ?? 0}`, { underline: true })

      doc.end()
    })

    ctx.set('Content-Type', 'application/pdf')
    ctx.set('Content-Disposition', `attachment; filename="factuur-${factuur.factuur_nummer}.pdf"`)
    ctx.body = Buffer.concat(buffers)
  },

  async snelstartExport(ctx: any) {
    const facturen = await strapi.entityService.findMany('api::factuur.factuur', {
      filters: { status: { $in: ['verzonden', 'betaald'] } },
      populate: ['klant'],
    }) as any[]

    const header = 'Factuurnummer,Klant,Datum,Vervaldatum,Subtotaal,BTW,Totaal,Status\n'
    const rows = facturen.map((f) =>
      [
        f.factuur_nummer,
        f.klant?.bedrijfsnaam ?? '',
        f.factuurdatum ?? '',
        f.vervaldatum ?? '',
        f.subtotaal ?? 0,
        f.btw_bedrag ?? 0,
        f.totaal ?? 0,
        f.status,
      ].join(',')
    )

    ctx.set('Content-Type', 'text/csv')
    ctx.set('Content-Disposition', 'attachment; filename="snelstart-export.csv"')
    ctx.body = header + rows.join('\n')
  },
}
