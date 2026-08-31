// YYYY-MM-DD in lokale tijd (geen toISOString → schuift niet naar UTC).
function dstr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Maakt automatisch een concept-factuur voor een afgeronde opdracht
 * (opgehaald/gewisseld). Idempotent: heeft de opdracht al een factuur, dan
 * gebeurt er niets. Prijsberekening spiegelt de facturatie-preview:
 * tarief (formaat × afval_soort) − evt. 10% speciaal tarief, + extra huur, + 21% btw.
 */
async function maakConceptFactuur(opdrachtId: number) {
  const opdracht = await strapi.entityService.findOne('api::opdracht.opdracht', opdrachtId, {
    populate: ['klant', 'container', 'factuur'],
  }) as any
  if (!opdracht || opdracht.factuur?.id) return

  let prijs = 0
  if (opdracht.container?.formaat && opdracht.afval_soort) {
    const tarieven = await strapi.entityService.findMany('api::tarief.tarief', {
      filters: { formaat: opdracht.container.formaat, afval_soort: opdracht.afval_soort },
      limit: 1,
    }) as any[]
    prijs = tarieven[0]?.prijs ?? 0
  }
  if (opdracht.klant?.speciaal_tarief) prijs = prijs * 0.9

  const extra_huur_bedrag = opdracht.extra_huur_actief ? (opdracht.extra_huur_dagen ?? 0) * 15 : 0
  const subtotaal = Math.round((prijs + extra_huur_bedrag) * 100) / 100
  const btw_bedrag = Math.round(subtotaal * 0.21 * 100) / 100
  const totaal = Math.round((subtotaal + btw_bedrag) * 100) / 100

  // Uniek factuurnummer F-<jaar>-<nnn>, oplopend op het hoogste bestaande nummer.
  const bestaand = await strapi.entityService.findMany('api::factuur.factuur', {
    fields: ['factuur_nummer'],
    limit: 10000,
  }) as any[]
  const max = bestaand
    .map(f => Number(String(f.factuur_nummer ?? '').match(/(\d+)\s*$/)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0)

  const now = new Date()
  const vervaldatum = new Date(now.getTime() + 14 * 86400000)

  await strapi.entityService.create('api::factuur.factuur', {
    data: {
      factuur_nummer: `F-${now.getFullYear()}-${String(max + 1).padStart(3, '0')}`,
      status: 'concept',
      transport_bedrag: prijs,
      extra_huur_bedrag,
      subtotaal,
      btw_bedrag,
      totaal,
      factuurdatum: dstr(now),
      vervaldatum: dstr(vervaldatum),
      opdracht: opdracht.id,
      klant: opdracht.klant?.id ?? null,
    },
  })
}

/**
 * Leidt de containerstatus af uit de opdracht (type + status). null = niet
 * wijzigen. Zo blijft de bak-status automatisch in sync met de actuele opdracht:
 * een geplaatste bak met een geplande ophaling wordt "klaar_voor_ophaling".
 */
function containerStatusVoor(type: string, status: string): string | null {
  if (status === 'geannuleerd') return 'beschikbaar'
  if (type === 'ophaling') {
    if (status === 'gepland' || status === 'onderweg') return 'klaar_voor_ophaling'
    if (status === 'opgehaald') return 'beschikbaar'
    return null
  }
  // plaatsing of wisseling
  if (status === 'gepland' || status === 'onderweg') return 'onderweg'
  if (status === 'geplaatst' || status === 'gewisseld') return 'geplaatst'
  if (status === 'opgehaald') return 'beschikbaar'
  return null
}

export default {
  async beforeCreate(event: any) {
    // Auto-increment opdracht_nummer
    const entries = await strapi.entityService.findMany('api::opdracht.opdracht', {
      sort: { opdracht_nummer: 'desc' },
      limit: 1,
      fields: ['opdracht_nummer'],
    })
    const last = (entries as any[])[0]?.opdracht_nummer ?? 0
    event.params.data.opdracht_nummer = last + 1
  },

  async afterCreate(event: any) {
    const { result } = event
    const opdracht = await strapi.entityService.findOne('api::opdracht.opdracht', result.id, {
      populate: ['container', 'klant'],
    }) as any

    // Containerstatus afleiden uit de opdracht (respecteer 'onderhoud') én de
    // opdrachtlocatie overnemen als huidige containerlocatie, zodat de bak meteen
    // op de juiste plek op de kaart staat.
    if (opdracht.container?.id) {
      const updateData: Record<string, any> = {}
      const nieuweStatus = containerStatusVoor(opdracht.type, opdracht.status ?? 'gepland')
      if (nieuweStatus && opdracht.container.status !== 'onderhoud') updateData.status = nieuweStatus

      const adres = [opdracht.adres, opdracht.postcode, opdracht.plaatsnaam].filter(Boolean).join(', ')
      if (adres) updateData.huidige_locatie_adres = adres
      if (opdracht.locatie_lat != null && opdracht.locatie_lng != null) {
        updateData.locatie_lat = opdracht.locatie_lat
        updateData.locatie_lng = opdracht.locatie_lng
      }
      if (Object.keys(updateData).length) {
        await strapi.entityService.update('api::container.container', opdracht.container.id, {
          data: updateData,
        })
      }
    }

    // Maak melding aan
    await strapi.entityService.create('api::melding.melding', {
      data: {
        type: 'opdracht_aangemaakt',
        titel: `Nieuwe opdracht #${opdracht.opdracht_nummer}`,
        bericht: `${opdracht.type} opdracht aangemaakt${opdracht.klant?.bedrijfsnaam ? ` voor ${opdracht.klant.bedrijfsnaam}` : ''}`,
        opdracht: result.id,
        container: opdracht.container?.id ?? null,
      },
    })
  },

  async afterUpdate(event: any) {
    const { result, params } = event
    const newStatus = params.data?.status
    if (!newStatus) return

    const opdracht = await strapi.entityService.findOne('api::opdracht.opdracht', result.id, {
      populate: ['container'],
    }) as any

    if (!opdracht.container?.id) return

    // Containerstatus afleiden uit type + nieuwe opdrachtstatus (respecteer
    // 'onderhoud' zodat een handmatige onderhoudsstatus niet wordt overschreven).
    const nieuweContainerStatus = containerStatusVoor(opdracht.type, newStatus)

    if (nieuweContainerStatus && opdracht.container.status !== 'onderhoud') {
      const updateData: Record<string, any> = { status: nieuweContainerStatus }

      if (newStatus === 'geplaatst' && opdracht.locatie_lat) {
        updateData.huidige_locatie_adres = [opdracht.adres, opdracht.postcode, opdracht.plaatsnaam].filter(Boolean).join(', ')
        updateData.locatie_lat = opdracht.locatie_lat
        updateData.locatie_lng = opdracht.locatie_lng
      }

      await strapi.entityService.update('api::container.container', opdracht.container.id, {
        data: updateData,
      })
    }

    // Automatisch concept-factuur zodra de opdracht is afgerond. Fout hierin mag
    // de statuswijziging niet blokkeren, dus apart afgevangen.
    if (newStatus === 'opgehaald' || newStatus === 'gewisseld') {
      try {
        await maakConceptFactuur(result.id)
      } catch (err) {
        strapi.log.error(`Concept-factuur aanmaken mislukt voor opdracht ${result.id}: ${err}`)
      }
    }

    // Melding bij statuswijziging
    await strapi.entityService.create('api::melding.melding', {
      data: {
        type: 'opdracht_status',
        titel: `Opdracht #${result.opdracht_nummer} → ${newStatus}`,
        bericht: `Status gewijzigd naar ${newStatus}`,
        opdracht: result.id,
        container: opdracht.container?.id ?? null,
      },
    })
  },
}
