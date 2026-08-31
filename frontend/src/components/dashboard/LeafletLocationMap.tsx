'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Search } from 'lucide-react'

// Pin voor de locatiekiezer. Standaard de container-illustratie (bak-pin-3);
// per gebruik overrulebaar (bv. man.png bij een klant). 16px hoog, verankerd
// op onder-midden.
function maakPin(src: string, hoogte = 16) {
  return L.divIcon({
    className: 'bak-pin',
    html: `<div style="transform:translate(-50%,-100%);width:max-content"><img src="${src}" alt="" style="height:${hoogte}px;width:auto;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))" /></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

interface LocatieResultaat {
  adres: string
  straat: string
  huisnummer: string
  postcode: string
  plaatsnaam: string
  lat: number
  lng: number
  source: 'address' | 'map'
}

function MapKlikHandler({ onKlik }: { onKlik: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onKlik(e.latlng.lat, e.latlng.lng) })
  return null
}

function FlyTo({ coords }: { coords: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(coords, 18, { animate: true, duration: 0.55 })
  }, [coords, map])
  return null
}

function formatPostcode(postcode: string) {
  return postcode.replace(/\s/g, '').replace(/^(\d{4})([A-Z]{2})$/i, (_, cijfers, letters) => `${cijfers} ${letters.toUpperCase()}`)
}

function parseAdres(doc: Record<string, string | undefined>) {
  let straat = doc.straatnaam ?? ''
  const huisnummer = doc.huisnummer ?? ''
  let adres = [straat, huisnummer].filter(Boolean).join(' ')
  let postcode = doc.postcode ?? ''
  let plaatsnaam = doc.woonplaatsnaam ?? doc.gemeentenaam ?? ''

  if (!adres || !plaatsnaam) {
    const parts = (doc.weergavenaam ?? '').split(', ')
    if (!adres && parts[0]) adres = parts[0].trim()
    if (!straat) straat = adres
    if (parts[1]) {
      const match = parts[1].match(/^(\d{4}\s?[A-Z]{2})\s+(.+)$/i)
      if (match) {
        if (!postcode) postcode = match[1]
        if (!plaatsnaam) plaatsnaam = match[2].trim()
      } else if (!plaatsnaam) {
        plaatsnaam = parts[1].trim()
      }
    }
  }

  return { adres, straat, huisnummer, postcode: formatPostcode(postcode), plaatsnaam }
}

function parsePoint(point?: string): [number, number] | null {
  const match = point?.match(/^POINT\(([-\d.]+)\s+([-\d.]+)\)$/)
  if (!match) return null
  const lng = Number(match[1])
  const lat = Number(match[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

interface Suggestie { id: string; label: string; doc: Record<string, string | undefined> }

export default function LeafletLocationMap({
  lat,
  lng,
  adres,
  onSelect,
  pinSrc = '/img/bak-pin-3.png',
  pinHoogte = 16,
}: {
  lat?: number
  lng?: number
  adres?: string
  onSelect: (r: LocatieResultaat) => void
  pinSrc?: string
  pinHoogte?: number
}) {
  const pinIcon = useMemo(() => maakPin(pinSrc, pinHoogte), [pinSrc, pinHoogte])
  const initialMarker = useMemo<[number, number] | null>(
    () => (lat != null && lng != null ? [lat, lng] : null),
    [lat, lng]
  )
  const [marker, setMarker] = useState<[number, number] | null>(initialMarker)
  const [laden, setLaden] = useState(false)
  const [label, setLabel] = useState(adres || 'Zoek een adres of klik op de kaart')

  // Zoekbalk met adres-suggesties (PDOK Locatieserver).
  const [zoek, setZoek] = useState('')
  const [suggesties, setSuggesties] = useState<Suggestie[]>([])
  const zoekTimer = useRef<number | null>(null)

  useEffect(() => {
    const q = zoek.trim()
    if (q.length < 3) { setSuggesties([]); return }
    if (zoekTimer.current) window.clearTimeout(zoekTimer.current)
    zoekTimer.current = window.setTimeout(async () => {
      try {
        const data = await fetch(
          `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&rows=6&fl=id,weergavenaam,centroide_ll,straatnaam,huisnummer,postcode,woonplaatsnaam,gemeentenaam`
        ).then(r => r.json())
        const docs = (data?.response?.docs ?? []) as Record<string, string | undefined>[]
        setSuggesties(docs.filter(d => d.centroide_ll).map(d => ({ id: d.id ?? d.weergavenaam ?? '', label: d.weergavenaam ?? '', doc: d })))
      } catch {
        setSuggesties([])
      }
    }, 300)
    return () => { if (zoekTimer.current) window.clearTimeout(zoekTimer.current) }
  }, [zoek])

  const kiesSuggestie = (s: Suggestie) => {
    const coords = parsePoint(s.doc.centroide_ll)
    if (!coords) return
    const result = parseAdres(s.doc)
    setMarker(coords)
    setLabel([result.adres, result.postcode, result.plaatsnaam].filter(Boolean).join(', ') || s.label)
    setZoek('')
    setSuggesties([])
    onSelect({ ...result, lat: coords[0], lng: coords[1], source: 'address' })
  }

  // Bestaand adres bij openen éénmalig geocoden om de pin te plaatsen. Bewust
  // alleen op mount (het start-adres via ref): zou dit op elke adres-wijziging
  // draaien, dan zou onSelect → adres-update → effect → onSelect een lus maken
  // wanneer er geen coördinaten zijn (zoals bij klanten).
  const startAdres = useRef(adres)
  useEffect(() => {
    const query = startAdres.current?.trim()
    if (initialMarker || !query || query.length < 8) return

    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setLaden(true)
      setLabel('Locatie opzoeken...')
      try {
        const data = await fetch(
          `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&rows=1`
        ).then(r => r.json())
        if (cancelled) return
        const doc = data?.response?.docs?.[0] as Record<string, string | undefined> | undefined
        const coords = parsePoint(doc?.centroide_ll)
        if (!doc || !coords) { setLabel(query); return }
        const result = parseAdres(doc)
        setMarker(coords)
        setLabel([result.adres, result.postcode, result.plaatsnaam].filter(Boolean).join(', ') || doc.weergavenaam || query)
        onSelect({ ...result, lat: coords[0], lng: coords[1], source: 'address' })
      } catch {
        if (!cancelled) setLabel(query)
      } finally {
        if (!cancelled) setLaden(false)
      }
    }, 650)

    return () => { cancelled = true; window.clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleKlik = async (klikLat: number, klikLng: number) => {
    setMarker([klikLat, klikLng])
    setLaden(true)
    setLabel('Adres opzoeken...')
    try {
      const data = await fetch(
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lon=${klikLng}&lat=${klikLat}&rows=1`
      ).then(r => r.json())
      const doc = data?.response?.docs?.[0] as Record<string, string | undefined> | undefined
      if (!doc) {
        setLabel('Geen adres gevonden, vul eventueel handmatig aan')
        onSelect({ adres: '', straat: '', huisnummer: '', postcode: '', plaatsnaam: '', lat: klikLat, lng: klikLng, source: 'map' })
        return
      }
      const result = parseAdres(doc)
      setLabel([result.adres, result.postcode, result.plaatsnaam].filter(Boolean).join(', ') || doc.weergavenaam || 'Locatie geselecteerd')
      onSelect({ ...result, lat: klikLat, lng: klikLng, source: 'map' })
    } catch {
      setLabel('Adres opzoeken mislukt, coördinaten zijn wel gekozen')
      onSelect({ adres: '', straat: '', huisnummer: '', postcode: '', plaatsnaam: '', lat: klikLat, lng: klikLng, source: 'map' })
    } finally {
      setLaden(false)
    }
  }

  return (
    <div className="relative h-[300px] overflow-hidden rounded-xl border border-line bg-[#E8ECEF] shadow-inner">
      <MapContainer
        center={marker ?? [52.18, 5.36]}
        zoom={marker ? 18 : 8}
        maxZoom={23}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
        className="h-full w-full dashboard-leaflet"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={20}
          maxNativeZoom={19}
        />
        <MapKlikHandler onKlik={handleKlik} />
        {marker && (
          <>
            <FlyTo coords={marker} />
            <Marker position={marker} icon={pinIcon} />
          </>
        )}
      </MapContainer>

      {/* Zoekbalk + suggesties, linksboven over de kaart. */}
      <div className="absolute left-1/2 top-3 z-[1000] w-[min(92%,20rem)] -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-app/95 px-3 shadow-lg backdrop-blur-md">
          <Search size={14} className="flex-shrink-0 text-ink-subtle" />
          <input
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoek een adres…"
            className="min-h-10 w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>
        {suggesties.length > 0 && (
          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-line bg-app/98 shadow-xl backdrop-blur-md">
            {suggesties.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => kiesSuggestie(s)}
                className="flex w-full items-center px-3 py-2 text-left text-xs text-ink-muted transition-colors hover:bg-fill hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 bottom-3 z-[1000] max-w-[92%] -translate-x-1/2 truncate rounded-lg border border-line bg-app/95 px-3 py-1.5 text-[11px] shadow-lg backdrop-blur-md">
        <span className={laden ? 'text-ink-subtle' : marker ? 'text-ink' : 'text-ink-subtle'}>{label}</span>
      </div>
    </div>
  )
}
