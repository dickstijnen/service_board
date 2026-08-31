import { randomUUID } from 'crypto'

/**
 * Geocodeert een adres naar lat/lng via PDOK Locatieserver (zelfde bron als de
 * locatiekiezer aan de voorkant). Geeft null bij geen resultaat/fout.
 */
async function geocode(adres: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(adres)}&rows=1&fl=centroide_ll`
    const res = await fetch(url)
    const json: any = await res.json()
    const point: string | undefined = json?.response?.docs?.[0]?.centroide_ll
    const m = point?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/) // POINT(lng lat)
    if (!m) return null
    return { lng: Number(m[1]), lat: Number(m[2]) }
  } catch {
    return null
  }
}

/**
 * Vult lat/lng aan uit `huidige_locatie_adres` wanneer er wél een adres is maar
 * (nog) geen coördinaten in dezelfde bewerking. Zo krijgt een container die
 * alleen een adres heeft toch een pin op de kaart — en wordt dat meteen
 * opgeslagen, dus de volgende keer staat het al klaar.
 */
async function vulCoordinatenAan(data: any) {
  const adres = data.huidige_locatie_adres
  if (adres && data.locatie_lat == null && data.locatie_lng == null) {
    const c = await geocode(adres)
    if (c) {
      data.locatie_lat = c.lat
      data.locatie_lng = c.lng
    }
  }
}

export default {
  async beforeCreate(event: any) {
    if (!event.params.data.qr_code_data) {
      event.params.data.qr_code_data = `CONTAINER:${randomUUID()}`
    }

    // Container_code automatisch: BAK-<nnn>, oplopend op het hoogste bestaande
    // nummer. Zo hoeft 'ie niet handmatig ingevuld te worden bij het aanmaken.
    if (!event.params.data.container_code) {
      const bestaand = await strapi.entityService.findMany('api::container.container', {
        fields: ['container_code'],
        limit: 5000,
      })
      const max = (bestaand as any[])
        .map(c => Number(String(c.container_code ?? '').match(/(\d+)\s*$/)?.[1] ?? 0))
        .reduce((a, b) => Math.max(a, b), 0)
      event.params.data.container_code = `BAK-${String(max + 1).padStart(3, '0')}`
    }

    await vulCoordinatenAan(event.params.data)
  },

  async beforeUpdate(event: any) {
    await vulCoordinatenAan(event.params.data)
  },
}
