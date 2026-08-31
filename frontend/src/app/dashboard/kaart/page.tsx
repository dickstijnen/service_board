'use client'
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, Laden, Card, StatusBadge, FilterPills, FilterRij } from '@/components/dashboard/ui'
import { containerStatusKleur , containerStatusLabel, formaatLabel, geplaatstLabel, klantNaam } from '@/lib/format'
import { MapPin, Package, ExternalLink, Clock, Home } from 'lucide-react'
import type { KaartKlant } from '@/components/dashboard/KlantenKaart'

// Leaflet is client-only → dynamisch laden zonder SSR.
const ContainersKaart = dynamic(() => import('@/components/dashboard/ContainersKaart'), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] rounded-2xl border border-line bg-surface animate-pulse" />,
})
const KlantenKaart = dynamic(() => import('@/components/dashboard/KlantenKaart'), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] rounded-2xl border border-line bg-surface animate-pulse" />,
})

// Adres → coördinaten via PDOK, met sessionStorage-cache (klanten hebben geen
// opgeslagen lat/lng, dus we geocoden hun adres client-side).
async function geocodeAdres(adres: string): Promise<[number, number] | null> {
  const key = `geo:${adres}`
  try { const c = sessionStorage.getItem(key); if (c) return JSON.parse(c) } catch {}
  try {
    const data = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(adres)}&rows=1&fl=centroide_ll`).then(r => r.json())
    const p = data?.response?.docs?.[0]?.centroide_ll as string | undefined
    const m = p?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
    if (!m) return null
    const coords: [number, number] = [Number(m[2]), Number(m[1])]
    try { sessionStorage.setItem(key, JSON.stringify(coords)) } catch {}
    return coords
  } catch { return null }
}

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

interface OpdrachtMetContainer {
  container?: KaartContainer
  chauffeur?: { id?: number }
}

function mapsLink(c: KaartContainer): string | null {
  if (c.locatie_lat != null && c.locatie_lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${c.locatie_lat},${c.locatie_lng}`
  }
  if (c.huidige_locatie_adres) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.huidige_locatie_adres)}`
  }
  return null
}

export default function KaartPage() {
  const { gebruiker } = useAuth()
  const isChauffeur = gebruiker?.rol === 'chauffeur'
  const [items, setItems] = useState<KaartContainer[]>([])
  const [laden, setLaden] = useState(true)
  const [weergave, setWeergave] = useState<'lijst' | 'kaart'>('kaart')
  const [geselecteerdId, setGeselecteerdId] = useState<number | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [homeKey, setHomeKey] = useState(1)               // start op de standplaats
  const [kaartModus, setKaartModus] = useState<'alles' | 'home'>('home')
  const reset = () => { setGeselecteerdId(null); setKaartModus('alles'); setResetKey(k => k + 1) }
  const naarHome = () => { setGeselecteerdId(null); setKaartModus('home'); setHomeKey(k => k + 1) }

  // Bron: containers of klanten (klanten alleen voor niet-chauffeurs).
  const [bron, setBron] = useState<'containers' | 'klanten'>('containers')
  const [klanten, setKlanten] = useState<KaartKlant[]>([])
  const [klantenLaden, setKlantenLaden] = useState(false)
  const [geselKlantId, setGeselKlantId] = useState<number | null>(null)
  const [klantResetKey, setKlantResetKey] = useState(0)

  const laadKlanten = useCallback(async () => {
    setKlantenLaden(true)
    try {
      const r = await apiGet<{ data: any[] }>('klanten?pagination[limit]=200&sort=bedrijfsnaam:asc')
      const lijst = r.data ?? []
      const resolved = (await Promise.all(lijst.map(async k => {
        const adres = [[k.straat, k.huisnummer].filter(Boolean).join(' '), k.postcode, k.plaatsnaam].filter(Boolean).join(', ')
        if (!adres) return null
        const coords = await geocodeAdres(adres)
        return coords ? { id: k.id, naam: klantNaam(k), adres, lat: coords[0], lng: coords[1] } as KaartKlant : null
      }))).filter(Boolean) as KaartKlant[]
      setKlanten(resolved)
    } catch (e) {
      console.error(e)
    } finally {
      setKlantenLaden(false)
    }
  }, [])

  useEffect(() => {
    if (bron === 'klanten' && klanten.length === 0) laadKlanten()
  }, [bron, klanten.length, laadKlanten])

  const laad = useCallback((stil = false) => {
    if (!stil) setLaden(true)
    if (isChauffeur) {
      apiGet<{ data: OpdrachtMetContainer[] }>('opdrachten?populate=*&pagination[limit]=300')
        .then(r => {
          const uniek = new Map<number, KaartContainer>()
          ;(r.data ?? [])
            .filter(o => o.chauffeur?.id === gebruiker?.id && o.container)
            .forEach(o => {
              if (o.container?.id) uniek.set(o.container.id, o.container)
            })
          setItems([...uniek.values()])
        })
        .catch(console.error)
        .finally(() => setLaden(false))
      return
    }

    apiGet<KaartContainer[]>('dashboard/containers-kaart').then(r => setItems(Array.isArray(r) ? r : [])).catch(console.error).finally(() => setLaden(false))
  }, [gebruiker?.id, isChauffeur])

  useEffect(() => {
    const id = window.setTimeout(laad, 0)
    return () => window.clearTimeout(id)
  }, [laad])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  // Klik op een marker → scroll de bijbehorende sidebar-kaart in beeld.
  useEffect(() => {
    if (geselecteerdId == null) return
    document.querySelector(`[data-container-id="${geselecteerdId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [geselecteerdId])
  useEffect(() => {
    if (geselKlantId == null) return
    document.querySelector(`[data-klant-id="${geselKlantId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [geselKlantId])

  const metGps = items.filter(c => c.locatie_lat != null && c.locatie_lng != null).length

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel={isChauffeur ? 'Containerlocaties' : 'Kaart'}
        sub={bron === 'klanten'
          ? `${klanten.length} klanten op de kaart`
          : isChauffeur ? `${items.length} containers uit jouw opdrachten · ${metGps} met GPS` : `${items.length} containers · ${metGps} met GPS`}
      />

      {!isChauffeur && (
        <FilterRij>
          <FilterPills
            actief={bron}
            onKies={v => setBron(v as 'containers' | 'klanten')}
            opties={[
              { value: 'containers', label: 'Containers' },
              { value: 'klanten', label: 'Klanten' },
            ]}
          />
        </FilterRij>
      )}

      {bron === 'klanten' ? (
        klantenLaden ? <Laden /> : klanten.length === 0 ? (
          <div className="text-center text-ink-subtle text-sm py-16">Geen klanten met een adres om te tonen</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <KlantenKaart klanten={klanten} geselecteerdId={geselKlantId} onMarkerKlik={setGeselKlantId} resetKey={klantResetKey} />
              <div className="absolute right-3 top-3 z-[500] rounded-xl border border-line bg-surface p-1 text-xs font-medium shadow-md">
                <button
                  onClick={() => { setGeselKlantId(null); setKlantResetKey(k => k + 1) }}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-white"
                >
                  Toon alles
                </button>
              </div>
            </div>
            <div className="lg:col-span-1 h-[60vh] min-h-[420px] overflow-y-auto rounded-2xl border border-line bg-surface divide-y divide-line">
              {klanten.map(k => {
                const actief = geselKlantId === k.id
                return (
                  <button
                    key={k.id}
                    data-klant-id={k.id}
                    onClick={() => setGeselKlantId(k.id)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${actief ? 'bg-accent/10' : 'hover:bg-fill'}`}
                  >
                    <span className="text-sm font-medium text-ink">{k.naam}</span>
                    <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
                      <MapPin size={11} className="flex-shrink-0" /><span className="truncate">{k.adres}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      ) : (
      <>
      <FilterRij>
        <FilterPills
          actief={weergave}
          onKies={v => setWeergave(v as 'lijst' | 'kaart')}
          opties={[
            { value: 'kaart', label: 'Kaart' },
            { value: 'lijst', label: 'Lijst' },
          ]}
        />
      </FilterRij>

      {laden ? <Laden /> : items.length === 0 ? (
        <div className="text-center text-ink-subtle text-sm py-16">Geen geplaatste containers</div>
      ) : weergave === 'kaart' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 2/3 kaart + zwevende knoppen (toon alles + standplaats) */}
          <div className="relative lg:col-span-2">
            <ContainersKaart containers={items} geselecteerdId={geselecteerdId} onMarkerKlik={setGeselecteerdId} resetKey={resetKey} homeKey={homeKey} />
            <div className="absolute right-3 top-3 z-[500] flex gap-1 rounded-xl border border-line bg-surface p-1 text-xs font-medium shadow-md">
              <button
                onClick={reset}
                title="Toon alle bakken"
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 transition-colors ${kaartModus === 'alles' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                Toon alles
              </button>
              <button
                onClick={naarHome}
                title="Naar de standplaats (Hommel 101, Apeldoorn)"
                aria-label="Naar de Pater"
                className={`inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 transition-colors ${kaartModus === 'home' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                <Home size={15} />
              </button>
            </div>
          </div>
          {/* 1/3 sidebar met de bakken — klikbaar, scrollt mee bij markerklik */}
          <div className="lg:col-span-1 h-[60vh] min-h-[420px] overflow-y-auto rounded-2xl border border-line bg-surface divide-y divide-line">
            {items.map(c => {
              const actief = geselecteerdId === c.id
              return (
                <button
                  key={c.id}
                  data-container-id={c.id}
                  onClick={() => setGeselecteerdId(c.id)}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${actief ? 'bg-accent/10' : 'hover:bg-fill'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-ink">{c.container_code}</span>
                    <StatusBadge status={c.status ?? ''} kleur={containerStatusKleur} labels={containerStatusLabel} />
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <MapPin size={11} className="flex-shrink-0" />
                    <span className="truncate">{c.huidige_locatie_adres ?? 'Geen adres bekend'}</span>
                  </span>
                  <span className="text-[11px] text-ink-subtle">{formaatLabel(c.formaat)} · {geplaatstLabel(c.dagen_geplaatst)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(c => {
            const link = mapsLink(c)
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                      <Package size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-mono text-ink">{c.container_code}</div>
                      <div className="text-xs text-ink-subtle">{formaatLabel(c.formaat)}</div>
                    </div>
                  </div>
                  <StatusBadge status={c.status ?? ''} kleur={containerStatusKleur} labels={containerStatusLabel} />
                </div>
                <div className="text-sm text-ink-muted flex items-start gap-1.5 mb-2">
                  <MapPin size={13} className="text-ink-subtle mt-0.5 flex-shrink-0" />
                  <span>{c.huidige_locatie_adres ?? 'Geen adres bekend'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink-subtle mb-3">
                  <Clock size={11} />{geplaatstLabel(c.dagen_geplaatst)}
                </div>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-medium text-white transition-colors hover:bg-accent/90">
                    Open in Maps <ExternalLink size={12} />
                  </a>
                )}
              </Card>
            )
          })}
        </div>
      )}
      </>
      )}
    </div>
  )
}
