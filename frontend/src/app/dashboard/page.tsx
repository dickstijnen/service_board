'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { klantNaam, datumKort, opdrachtTypeKleur , formaatLabel } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/ui'
import { OnderdelenMenu } from '@/components/dashboard/OnderdelenMenu'
import { Package, ClipboardList, Clock, MapPin, ExternalLink, CheckCircle2 } from 'lucide-react'

interface ChauffeurOpdracht {
  id: number
  opdracht_nummer?: number
  type?: string
  status?: string
  adres?: string
  postcode?: string
  plaatsnaam?: string
  locatie_lat?: number
  locatie_lng?: number
  datum_gepland?: string
  voorkeur_tijdstip?: string
  klant?: { bedrijfsnaam?: string; voornaam?: string; achternaam?: string }
  container?: {
    container_code?: string
    formaat?: string
    huidige_locatie_adres?: string
    locatie_lat?: number
    locatie_lng?: number
  }
  chauffeur?: { id?: number }
}

function KpiKaart({ label, waarde, sub, icon: Icon, kleur }: {
  label: string; waarde: string | number; sub?: string
  icon: React.ElementType; kleur: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kleur}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-3xl font-bold text-ink mb-1">{waarde}</div>
      <div className="text-sm text-ink-muted">{label}</div>
      {sub && <div className="text-xs text-ink-subtle mt-1">{sub}</div>}
    </div>
  )
}

function isoDag(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapsLink(o: ChauffeurOpdracht) {
  const lat = o.locatie_lat ?? o.container?.locatie_lat
  const lng = o.locatie_lng ?? o.container?.locatie_lng
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  const adres = [o.adres, o.postcode, o.plaatsnaam].filter(Boolean).join(', ') || o.container?.huidige_locatie_adres
  return adres ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}` : null
}

function ChauffeurRit({ opdracht }: { opdracht: ChauffeurOpdracht }) {
  const link = mapsLink(opdracht)
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium text-ink">{klantNaam(opdracht.klant)}</div>
          <div className="text-xs text-ink-subtle font-mono mt-0.5">#{opdracht.opdracht_nummer ?? '—'}</div>
        </div>
        <StatusBadge status={opdracht.type ?? 'rit'} kleur={opdrachtTypeKleur} />
      </div>
      <div className="space-y-1.5 text-xs text-ink-subtle">
        <div className="flex items-start gap-1.5">
          <MapPin size={12} className="mt-0.5 text-ink-subtle flex-shrink-0" />
          <span>{[opdracht.adres, opdracht.postcode, opdracht.plaatsnaam].filter(Boolean).join(', ') || opdracht.container?.huidige_locatie_adres || 'Geen locatie bekend'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-ink-subtle" />
          <span>{datumKort(opdracht.datum_gepland)}{opdracht.voorkeur_tijdstip ? ` · ${opdracht.voorkeur_tijdstip}` : ''}</span>
        </div>
        {opdracht.container?.container_code && (
          <div className="flex items-center gap-1.5">
            <Package size={12} className="text-ink-subtle" />
            <span>{opdracht.container.container_code} · {formaatLabel(opdracht.container.formaat)}</span>
          </div>
        )}
      </div>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fill px-4 py-2 text-xs font-medium text-accent hover:bg-accent/15 transition-colors">
          Open locatie <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { gebruiker } = useAuth()
  const [ritten, setRitten] = useState<ChauffeurOpdracht[]>([])
  const [laden, setLaden] = useState(true)
  const isChauffeur = gebruiker?.rol === 'chauffeur'

  const laad = useCallback((stil = false) => {
    if (!stil) setLaden(true)
    if (isChauffeur) {
      const vandaag = new Date()
      const overWeek = new Date(vandaag)
      overWeek.setDate(vandaag.getDate() + 7)
      const params =
        `populate=*&pagination[limit]=100&sort=datum_gepland:asc` +
        `&filters[datum_gepland][$gte]=${isoDag(vandaag)}` +
        `&filters[datum_gepland][$lte]=${isoDag(overWeek)}`

      apiGet<{ data: ChauffeurOpdracht[] }>(`opdrachten?${params}`)
        .then(r => setRitten((r.data ?? []).filter(o => o.chauffeur?.id === gebruiker?.id)))
        .catch(console.error)
        .finally(() => setLaden(false))
      return
    }

    // Kantoor-dashboard is een launcher (tegels) — geen stats meer op te halen.
    setLaden(false)
  }, [gebruiker?.id, isChauffeur])

  useEffect(() => {
    const id = window.setTimeout(laad, 0)
    return () => window.clearTimeout(id)
  }, [laad])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')
  const voornaam = (gebruiker?.name ?? gebruiker?.username ?? '').trim().split(/\s+/)[0]
  const uur = new Date().getHours()
  const groet = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">{isChauffeur ? 'Mijn dashboard' : 'Dashboard'}</h1>
        <p className="text-sm text-ink-subtle mt-1">{groet}{voornaam ? `, ${voornaam}` : ''}</p>
      </div>

      {laden ? (
        <div className="text-ink-subtle text-sm">Laden...</div>
      ) : isChauffeur ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <KpiKaart label="Ritten komende 7 dagen" waarde={ritten.length} icon={ClipboardList} kleur="bg-accent/20 text-accent" />
            <KpiKaart label="Vandaag" waarde={ritten.filter(r => r.datum_gepland === isoDag(new Date())).length} icon={Clock} kleur="bg-blue-500/20 text-blue-600" />
          </div>
          {ritten.length === 0 ? (
            <div className="text-sm text-ink-subtle flex items-center gap-2 py-8">
              <CheckCircle2 size={16} className="text-accent/50" /> Geen ritten gepland.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ritten.map(rit => <ChauffeurRit key={rit.id} opdracht={rit} />)}
            </div>
          )}
        </div>
      ) : null}

      <OnderdelenMenu />
    </div>
  )
}
