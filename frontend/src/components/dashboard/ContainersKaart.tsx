'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

interface KaartContainer {
  id: number
  container_code?: string
  formaat?: string
  status?: string
  huidige_locatie_adres?: string
  locatie_lat?: number
  locatie_lng?: number
  dagen_geplaatst?: number
}

// Standplaats/depot — Hommel 101, Apeldoorn.
const HOME: [number, number] = [52.24691298, 5.96735897]

const HOME_ICON = L.divIcon({
  className: 'bak-pin',
  html: `<div style="transform:translate(-50%,-100%);width:max-content"><img src="/img/home.png" alt="" style="height:30px;width:auto;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))" /></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  popupAnchor: [0, -32],
})

// Pin-afbeelding per formaat: 20 m³ en 40 m³ krijgen hun eigen bak, de rest de
// standaardbak. De maat wordt uit de formaat-code (bv. "c20m3") gehaald.
function pinBestand(formaat?: string) {
  const m = (formaat ?? '').match(/(\d+)\s*m3/i)
  const maat = m ? Number(m[1]) : 0
  if (maat === 20) return '/img/bak-pin-20.png'
  if (maat === 40) return '/img/bak-pin-40.png'
  if (maat === 1) return '/img/bak-pin-1.png'
  return '/img/bak-pin-3.png'
}

// De pin is de container-illustratie uit /public: altijd 16px hoog, breedte
// naar eigen verhouding. De wrapper-transform ankert 'm op onder-midden zodat
// we de (variabele) breedte niet hoeven te kennen. Actief = groene gloed.
function bakIcon(actief: boolean, formaat?: string) {
  const schaduw = actief
    ? 'drop-shadow(0 2px 3px rgba(0,0,0,.4)) drop-shadow(0 0 5px rgba(18,137,57,.95))'
    : 'drop-shadow(0 2px 3px rgba(0,0,0,.35))'
  return L.divIcon({
    className: 'bak-pin',
    html: `<div style="transform:translate(-50%,-100%);width:max-content"><img src="${pinBestand(formaat)}" alt="" style="height:16px;width:auto;display:block;filter:${schaduw}" /></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -18],
  })
}

/** Zoomt/pant zodat alle markers in beeld komen — bij eerste load én bij reset. */
function PasBounds({ punten, resetKey }: { punten: [number, number][]; resetKey: number }) {
  const map = useMap()
  // De kaart opent in home-modus, dus bij de allereerste render niet auto-fitten;
  // alleen wanneer "Toon alles" opnieuw wordt geklikt (resetKey verandert).
  const eerste = useRef(true)
  useEffect(() => {
    if (eerste.current) { eerste.current = false; return }
    if (punten.length === 0) return
    if (punten.length === 1) map.flyTo(punten[0], 14, { duration: 0.6 })
    else map.flyToBounds(punten, { padding: [48, 48], maxZoom: 16, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])
  return null
}

/**
 * Vliegt naar de geselecteerde container (marker- óf sidebar-klik) en opent
 * dáárna pas de popup. Openen tíjdens de flyTo-animatie negeert Leaflet, dus we
 * wachten op `moveend` — zo verschijnt de tooltip betrouwbaar bij elke selectie.
 */
function FlyNaar({ target, selectedId, markerRefs }: {
  target: [number, number] | null
  selectedId: number | null
  markerRefs: { current: Map<number, L.Marker> }
}) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const open = () => { if (selectedId != null) markerRefs.current.get(selectedId)?.openPopup() }
    map.once('moveend', open)
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6 })
    return () => { map.off('moveend', open) }
  }, [target, selectedId, map, markerRefs])
  return null
}

/** Vliegt naar de standplaats en opent daarna de home-popup ("De Pater"). */
function VliegNaarHome({ homeKey, homeRef }: {
  homeKey: number
  homeRef: { current: L.Marker | null }
}) {
  const map = useMap()
  useEffect(() => {
    if (homeKey <= 0) return
    const open = () => homeRef.current?.openPopup()
    map.once('moveend', open)
    map.flyTo(HOME, 11.4, { duration: 0.6 })
    return () => { map.off('moveend', open) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey])
  return null
}

export default function ContainersKaart({ containers, geselecteerdId, onMarkerKlik, resetKey = 0, homeKey = 0 }: {
  containers: KaartContainer[]
  geselecteerdId?: number | null
  onMarkerKlik?: (id: number) => void
  resetKey?: number
  homeKey?: number
}) {
  const met = containers.filter(c => c.locatie_lat != null && c.locatie_lng != null)
  const punten = met.map(c => [Number(c.locatie_lat), Number(c.locatie_lng)] as [number, number])
  const gesel = met.find(c => c.id === geselecteerdId)
  const target: [number, number] | null = gesel ? [Number(gesel.locatie_lat), Number(gesel.locatie_lng)] : null
  // Actieve marker als laatste tekenen (bovenop).
  const gesorteerd = [...met].sort((a, b) => (a.id === geselecteerdId ? 1 : 0) - (b.id === geselecteerdId ? 1 : 0))

  // Refs naar de Leaflet-markers zodat de fly-componenten ná het vliegen de
  // juiste popup kunnen openen (openen tijdens de animatie negeert Leaflet).
  const markerRefs = useRef(new Map<number, L.Marker>())
  const homeRef = useRef<L.Marker | null>(null)

  return (
    <div className="h-[60vh] min-h-[420px] overflow-hidden rounded-2xl border border-line">
      <MapContainer
        center={punten[0] ?? [52.18, 5.36]}
        zoom={8}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
        className="h-full w-full dashboard-leaflet"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} maxNativeZoom={19} />
        <PasBounds punten={punten} resetKey={resetKey} />
        <FlyNaar target={target} selectedId={geselecteerdId ?? null} markerRefs={markerRefs} />
        <VliegNaarHome homeKey={homeKey} homeRef={homeRef} />
        <Marker position={HOME} icon={HOME_ICON} zIndexOffset={1000000} ref={(m) => { homeRef.current = m }}>
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">De Pater</div>
            </div>
          </Popup>
        </Marker>
        {gesorteerd.map(c => (
          <Marker
            key={c.id}
            position={[Number(c.locatie_lat), Number(c.locatie_lng)]}
            icon={bakIcon(c.id === geselecteerdId, c.formaat)}
            zIndexOffset={c.id === geselecteerdId ? 1000 : 0}
            ref={(m) => { if (m) markerRefs.current.set(c.id, m); else markerRefs.current.delete(c.id) }}
            eventHandlers={{ click: () => onMarkerKlik?.(c.id) }}
          >
            <Popup>
              <div className="text-xs font-semibold">{c.container_code}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
