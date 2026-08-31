export default {
  async stats(ctx: any) {
    const now = new Date()
    // YYYY-MM-DD voor het date-veld factuurdatum; geen toISOString() (verschuift
    // naar UTC en daarmee een dag terug in tijdzones vóór UTC).
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [actieveContainers, extraHuur, openOpdrachten, facturen] = await Promise.all([
      strapi.entityService.count('api::container.container', {
        filters: { status: { $in: ['geplaatst', 'onderweg'] } },
      }),
      strapi.entityService.count('api::opdracht.opdracht', {
        filters: { extra_huur_actief: true },
      }),
      strapi.entityService.count('api::opdracht.opdracht', {
        filters: { status: { $in: ['gepland', 'onderweg'] } },
      }),
      strapi.entityService.findMany('api::factuur.factuur', {
        filters: {
          status: 'betaald',
          factuurdatum: { $gte: startOfMonth },
        },
        fields: ['totaal'],
      }) as unknown as any[],
    ])

    const maandomzet = facturen.reduce((sum: number, f: any) => sum + (f.totaal ?? 0), 0)

    ctx.body = { actieveContainers, extraHuur, openOpdrachten, maandomzet }
  },

  async containersKaart(ctx: any) {
    const containers = await strapi.entityService.findMany('api::container.container', {
      filters: { status: { $in: ['geplaatst', 'onderweg', 'beschikbaar'] } },
      fields: ['id', 'container_code', 'formaat', 'status', 'huidige_locatie_adres', 'locatie_lat', 'locatie_lng', 'updatedAt'],
    }) as any[]

    // Fallback-locatie: containers zonder eigen coördinaten krijgen automatisch
    // de locatie van hun meest recente opdracht die wél een locatie heeft. Zo
    // krijgt een bak zonder adres toch een pin op de kaart.
    const zonderCoord = containers.filter((c) => c.locatie_lat == null || c.locatie_lng == null)
    if (zonderCoord.length) {
      const opdrachten = await strapi.entityService.findMany('api::opdracht.opdracht', {
        filters: {
          container: { id: { $in: zonderCoord.map((c) => c.id) } },
          locatie_lat: { $notNull: true },
          locatie_lng: { $notNull: true },
        },
        fields: ['adres', 'postcode', 'plaatsnaam', 'locatie_lat', 'locatie_lng', 'datum_gepland', 'createdAt'],
        populate: { container: { fields: ['id'] } },
        sort: ['datum_gepland:desc', 'createdAt:desc'],
        limit: 2000,
      }) as any[]

      // Eerste hit per container = de meest recente (sort is al aflopend).
      const perContainer = new Map<number, any>()
      for (const o of opdrachten) {
        const cid = o.container?.id
        if (cid && !perContainer.has(cid)) perContainer.set(cid, o)
      }
      for (const c of zonderCoord) {
        const o = perContainer.get(c.id)
        if (!o) continue
        c.locatie_lat = o.locatie_lat
        c.locatie_lng = o.locatie_lng
        if (!c.huidige_locatie_adres) {
          c.huidige_locatie_adres = [o.adres, o.postcode, o.plaatsnaam].filter(Boolean).join(', ') || null
        }
      }
    }

    const now = Date.now()
    const result = containers.map((c) => ({
      ...c,
      dagen_geplaatst: c.updatedAt
        ? Math.floor((now - new Date(c.updatedAt).getTime()) / 86400000)
        : 0,
    }))

    ctx.body = result
  },

  // Nieuwe chauffeur = users-permissions user met rol 'chauffeur' + de
  // 'authenticated' plugin-rol. Wachtwoord wordt door de plugin gehasht.
  async chauffeurAanmaken(ctx: any) {
    const { name, email, password, telefoon, geboortedatum } = ctx.request.body ?? {}
    if (!email || !password) return ctx.badRequest('E-mail en wachtwoord zijn verplicht')

    const authRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } })

    try {
      const user = await strapi.plugin('users-permissions').service('user').add({
        username: email,
        email,
        password,
        name: name || null,
        telefoon: telefoon || null,
        geboortedatum: geboortedatum || null,
        rol: 'chauffeur',
        role: authRole?.id,
        confirmed: true,
        blocked: false,
        provider: 'local',
      })
      ctx.body = { id: user.id, email: user.email, name: user.name }
    } catch (err) {
      strapi.log.error(`Chauffeur aanmaken mislukt: ${err}`)
      ctx.badRequest('Chauffeur aanmaken mislukt — bestaat dit e-mailadres al?')
    }
  },

  // Chauffeurgegevens bijwerken (naam/telefoon/geboortedatum). Alleen de
  // meegestuurde velden worden gewijzigd.
  async chauffeurBijwerken(ctx: any) {
    const { id } = ctx.params
    const body = ctx.request.body ?? {}
    const user = await strapi.entityService.findOne('plugin::users-permissions.user', id, { fields: ['rol'] }) as any
    if (!user) return ctx.notFound('Chauffeur niet gevonden')

    const data: Record<string, any> = {}
    if ('name' in body) data.name = body.name || null
    if ('telefoon' in body) data.telefoon = body.telefoon || null
    if ('geboortedatum' in body) data.geboortedatum = body.geboortedatum || null
    if ('blocked' in body) data.blocked = !!body.blocked

    await strapi.entityService.update('plugin::users-permissions.user', id, { data })
    ctx.body = { ok: true }
  },
}
