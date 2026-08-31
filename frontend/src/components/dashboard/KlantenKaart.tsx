'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

export interface KaartKlant {
  id: number
  naam: string
  adres?: string
  lat: number
  lng: number
}

function manIcon(actief: boolean) {
  const schaduw = actief
    ? 'drop-shadow(0 2px 3px rgba(0,0,0,.4)) drop-shadow(0 0 6px rgba(18,137,57,.95))'
    : 'drop-shadow(0 2px 3px rgba(0,0,0,.35))'
  return L.divIcon({
    className: 'bak-pin',
    html: `<div style="transform:translate(-50%,-100%);width:max-content"><img src="/img/man.png" alt="" style="height:${actief ? 40 : 32}px;width:auto;display:block;filter:${schaduw}" /></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, actief ? -42 : -34],
  })
}

/** Past de kaart zodat alle pins in beeld komen (eerste load + reset). */
function PasBounds({ punten, resetKey }: { punten: [number, number][]; resetKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (punten.length === 0) return
    if (punten.length === 1) map.flyTo(punten[0], 14, { duration: 0.6 })
    else map.flyToBounds(punten, { padding: [48, 48], maxZoom: 16, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, punten.length])
  return null
}

/** Vliegt naar de geselecteerde klant en opent daarna de popup. */
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

export default function KlantenKaart({ klanten, geselecteerdId, onMarkerKlik, resetKey = 0 }: {
  klanten: KaartKlant[]
  geselecteerdId?: number | null
  onMarkerKlik?: (id: number) => void
  resetKey?: number
}) {
  const punten = klanten.map(k => [k.lat, k.lng] as [number, number])
  const gesel = klanten.find(k => k.id === geselecteerdId)
  const target: [number, number] | null = gesel ? [gesel.lat, gesel.lng] : null
  const gesorteerd = [...klanten].sort((a, b) => (a.id === geselecteerdId ? 1 : 0) - (b.id === geselecteerdId ? 1 : 0))
  const markerRefs = useRef(new Map<number, L.Marker>())

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
        {gesorteerd.map(k => (
          <Marker
            key={k.id}
            position={[k.lat, k.lng]}
            icon={manIcon(k.id === geselecteerdId)}
            zIndexOffset={k.id === geselecteerdId ? 1000 : 0}
            ref={(m) => { if (m) markerRefs.current.set(k.id, m); else markerRefs.current.delete(k.id) }}
            eventHandlers={{ click: () => onMarkerKlik?.(k.id) }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{k.naam}</div>
                {k.adres && <div className="text-ink-muted">{k.adres}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
