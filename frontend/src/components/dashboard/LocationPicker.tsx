'use client'
import dynamic from 'next/dynamic'

const LeafletLocationMap = dynamic(() => import('./LeafletLocationMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] rounded-xl border border-line bg-surface animate-pulse" />
  ),
})

export interface LocatieResultaat {
  adres: string
  straat: string
  huisnummer: string
  postcode: string
  plaatsnaam: string
  lat: number
  lng: number
  source: 'address' | 'map'
}

export function LocationPicker({
  lat,
  lng,
  adres,
  onSelect,
  pinSrc,
  pinHoogte,
}: {
  lat?: number
  lng?: number
  adres?: string
  onSelect: (r: LocatieResultaat) => void
  pinSrc?: string
  pinHoogte?: number
}) {
  return (
    <LeafletLocationMap
      key={`${lat ?? 'none'}|${lng ?? 'none'}`}
      lat={lat}
      lng={lng}
      adres={adres}
      onSelect={onSelect}
      pinSrc={pinSrc}
      pinHoogte={pinHoogte}
    />
  )
}
