'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiPut, apiUploadFile } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { klantNaam, datumKort, opdrachtStatusKleur, opdrachtTypeKleur , formaatLabel } from '@/lib/format'
import { StatusBadge } from '@/components/dashboard/ui'
import { ClipboardList, Clock, MapPin, Package, ExternalLink, CheckCircle2, User, X, Camera, AlertTriangle, RefreshCw } from 'lucide-react'

const STRAPI = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'
const AFVAL_SOORTEN = ['puin', 'afval', 'hout', 'grond', 'groen', 'gemengd', 'overig']

interface Opdracht {
  id: number
  documentId?: string
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
  afval_soort?: string
  afval_soort_werkelijk?: string
  overbeladen?: boolean
  overbeladen_m3?: number
  andere_materialen?: boolean
  andere_materialen_omschrijving?: string
  ophaling_opmerkingen?: string
  fotos?: OpdrachtFoto[]
  klant?: { bedrijfsnaam?: string; voornaam?: string; achternaam?: string }
  container?: {
    container_code?: string
    formaat?: string
    huidige_locatie_adres?: string
    locatie_lat?: number
    locatie_lng?: number
  }
  chauffeur?: { id?: number; username?: string; name?: string }
}

interface OpdrachtFoto {
  id?: number
  type?: string
  afbeelding?: { url?: string }
  url?: string
}

interface OphalingForm {
  afval_soort_werkelijk: string
  overbeladen: boolean
  overbeladen_m3: string
  andere_materialen: boolean
  andere_materialen_omschrijving: string
  ophaling_opmerkingen: string
}

// Eindstatussen: hierna is er geen vervolgactie meer voor de chauffeur.
const AFGEROND = ['opgehaald', 'gewisseld', 'geplaatst', 'geannuleerd']
const isAfgerond = (status?: string) => AFGEROND.includes(status ?? '')

function isoDag(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mediaUrl(url?: string) {
  if (!url) return ''
  return url.startsWith('http') ? url : `${STRAPI}${url}`
}

function mapsLink(o: Opdracht) {
  const lat = o.locatie_lat ?? o.container?.locatie_lat
  const lng = o.locatie_lng ?? o.container?.locatie_lng
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  const adres = [o.adres, o.postcode, o.plaatsnaam].filter(Boolean).join(', ') || o.container?.huidige_locatie_adres
  return adres ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}` : null
}

function KpiKaart({ label, waarde, icon: Icon, kleur }: {
  label: string
  waarde: string | number
  icon: React.ElementType
  kleur: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${kleur}`}>
        <Icon size={18} />
      </div>
      <div className="mb-1 text-3xl font-bold text-ink">{waarde}</div>
      <div className="text-sm text-ink-muted">{label}</div>
    </div>
  )
}

function RitKaart({ opdracht, toonChauffeur, onOpen }: { opdracht: Opdracht; toonChauffeur: boolean; onOpen: () => void }) {
  const link = mapsLink(opdracht)
  const klaar = isAfgerond(opdracht.status)

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{klantNaam(opdracht.klant)}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-subtle">#{opdracht.opdracht_nummer ?? '—'}</div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <StatusBadge status={opdracht.type ?? 'rit'} kleur={opdrachtTypeKleur} />
          <StatusBadge status={opdracht.status ?? '—'} kleur={opdrachtStatusKleur} />
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-ink-subtle">
        <div className="flex items-start gap-1.5">
          <MapPin size={12} className="mt-0.5 flex-shrink-0 text-ink-subtle" />
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
        {toonChauffeur && (
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-ink-subtle" />
            <span>{opdracht.chauffeur?.name ?? opdracht.chauffeur?.username ?? 'Geen chauffeur'}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onOpen} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
          klaar ? 'bg-fill text-ink-muted hover:bg-line' : 'bg-accent text-white hover:bg-accent/90'}`}>
          {klaar ? 'Details bekijken' : 'Details / afronden'}
        </button>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fill px-4 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/15">
            Open locatie <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-fill'}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${value ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function OpdrachtDetailModal({
  opdracht,
  onClose,
  onUpdated,
}: {
  opdracht: Opdracht
  onClose: () => void
  onUpdated: (opdracht: Opdracht) => void
}) {
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [fotos, setFotos] = useState<string[]>(() => (opdracht.fotos ?? []).map(f => mediaUrl(f.afbeelding?.url ?? f.url)).filter(Boolean))
  const fotoRef = useRef<HTMLInputElement>(null)
  const heeftOphalingForm = opdracht.type === 'ophaling' || opdracht.type === 'wisseling'
  const klaar = isAfgerond(opdracht.status)
  const [form, setForm] = useState<OphalingForm>({
    afval_soort_werkelijk: opdracht.afval_soort_werkelijk || opdracht.afval_soort || '',
    overbeladen: !!opdracht.overbeladen,
    overbeladen_m3: opdracht.overbeladen_m3 ? String(opdracht.overbeladen_m3) : '',
    andere_materialen: !!opdracht.andere_materialen,
    andere_materialen_omschrijving: opdracht.andere_materialen_omschrijving || '',
    ophaling_opmerkingen: opdracht.ophaling_opmerkingen || '',
  })

  const set = <K extends keyof OphalingForm>(k: K, v: OphalingForm[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const volgendeStatus = opdracht.status === 'gepland'
    ? 'onderweg'
    : opdracht.status === 'onderweg'
      ? opdracht.type === 'wisseling' ? 'gewisseld' : opdracht.type === 'ophaling' ? 'opgehaald' : 'geplaatst'
      : null
  const actieLabel = volgendeStatus === 'onderweg'
    ? 'Onderweg melden'
    : volgendeStatus === 'gewisseld'
      ? 'Wissel voltooien'
      : volgendeStatus === 'opgehaald'
        ? 'Ophalen voltooien'
        : volgendeStatus === 'geplaatst'
          ? 'Aflevering bevestigen'
          : null

  const uploadFoto = async (file: File) => {
    const preview = URL.createObjectURL(file)
    setFotos(prev => [...prev, preview])
    const uploaded = await apiUploadFile(file)
    const media = uploaded[0]
    if (!media?.id) return

    await apiPost('opdracht-fotos', {
      data: {
        bestandsnaam: file.name,
        type: heeftOphalingForm ? 'na' : 'voor',
        afbeelding: media.id,
        opdracht: opdracht.id,
      },
    })

    // Blob-preview vervangen door de echt opgeslagen media, zodat de foto's
    // ook na sluiten/heropenen (en op andere apparaten) zichtbaar blijven.
    const key = opdracht.documentId ?? String(opdracht.id)
    const vers = await apiGet<{ data: Opdracht }>(`opdrachten/${key}?populate[fotos][populate][afbeelding]=true`)
    const bewaard = vers.data?.fotos ?? []
    setFotos(bewaard.map(f => mediaUrl(f.afbeelding?.url ?? f.url)).filter(Boolean))
    URL.revokeObjectURL(preview)
    onUpdated({ ...opdracht, fotos: bewaard })
  }

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBezig(true); setFout('')
    try {
      await uploadFoto(file)
    } catch (err) {
      console.error(err)
      setFout('Foto uploaden mislukt')
    } finally {
      setBezig(false)
      e.target.value = ''
    }
  }

  const updateStatus = async () => {
    if (!volgendeStatus) return
    if (heeftOphalingForm && volgendeStatus !== 'onderweg' && !form.afval_soort_werkelijk) {
      setFout('Selecteer eerst de afvalsoort')
      return
    }

    setBezig(true); setFout('')
    const data: Record<string, unknown> = { status: volgendeStatus }
    if (heeftOphalingForm && volgendeStatus !== 'onderweg') {
      Object.assign(data, {
        afval_soort_werkelijk: form.afval_soort_werkelijk,
        overbeladen: form.overbeladen,
        overbeladen_m3: form.overbeladen ? Number(form.overbeladen_m3) || null : null,
        andere_materialen: form.andere_materialen,
        andere_materialen_omschrijving: form.andere_materialen ? form.andere_materialen_omschrijving || null : null,
        ophaling_opmerkingen: form.ophaling_opmerkingen || null,
      })
    }

    try {
      const key = opdracht.documentId ?? String(opdracht.id)
      const res = await apiPut<{ data: Opdracht }>(`opdrachten/${key}`, { data })
      onUpdated({ ...opdracht, ...(res.data ?? {}), ...data })
    } catch (err) {
      console.error(err)
      setFout('Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-app shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-ink">{klantNaam(opdracht.klant)}</div>
            <div className="mt-0.5 text-xs text-ink-subtle">#{opdracht.opdracht_nummer ?? '—'} · {opdracht.type ?? 'rit'} · {opdracht.status ?? '—'}</div>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-fill hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="mb-5 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
            <div className="mb-1 flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 text-ink-subtle" />
              <span>{[opdracht.adres, opdracht.postcode, opdracht.plaatsnaam].filter(Boolean).join(', ') || 'Geen locatie bekend'}</span>
            </div>
            {opdracht.voorkeur_tijdstip && <div className="ml-6 text-xs text-ink-subtle">Voorkeur: {opdracht.voorkeur_tijdstip}</div>}
          </div>

          {heeftOphalingForm && (
            <div className="mb-5 rounded-xl border border-line bg-surface p-4">
              <div className="mb-4 text-xs font-semibold tracking-wide text-ink-subtle">Ophalingdetails</div>

              <div className="mb-4">
                <label className="mb-2 block text-xs text-ink-subtle">Afvalsoort werkelijk</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {AFVAL_SOORTEN.map(soort => (
                    <button key={soort} type="button" disabled={klaar} onClick={() => set('afval_soort_werkelijk', soort)}
                      className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed ${
                        form.afval_soort_werkelijk === soort
                          ? 'border-accent bg-accent text-white'
                          : 'border-line bg-surface text-ink-muted hover:border-accent/40'
                      }`}>
                      {soort}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3 rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted">Overbeladen</span>
                  <Toggle value={form.overbeladen} onChange={v => set('overbeladen', v)} />
                </div>
                {form.overbeladen && (
                  <div className="mt-3 flex items-center gap-2">
                    <input type="number" min="0" step="0.5" value={form.overbeladen_m3} disabled={klaar}
                      onChange={e => set('overbeladen_m3', e.target.value)}
                      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent/50" />
                    <span className="text-sm text-ink-subtle">m3</span>
                  </div>
                )}
              </div>

              <div className="mb-3 rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-muted">Andere materialen</span>
                  <Toggle value={form.andere_materialen} onChange={v => set('andere_materialen', v)} />
                </div>
                {form.andere_materialen && (
                  <textarea rows={2} value={form.andere_materialen_omschrijving} disabled={klaar}
                    onChange={e => set('andere_materialen_omschrijving', e.target.value)}
                    placeholder="Omschrijf welke materialen..."
                    className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent/50" />
                )}
              </div>

              <textarea rows={3} value={form.ophaling_opmerkingen} disabled={klaar}
                onChange={e => set('ophaling_opmerkingen', e.target.value)}
                placeholder="Opmerkingen bij ophalen..."
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent/50" />
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-subtle">
              <Camera size={14} /> Fotos
            </div>
            <div className="flex flex-wrap gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {fotos.map((src, i) => <img key={`${src}-${i}`} src={src} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" />)}
              {!klaar && (
                <button onClick={() => fotoRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-ink-subtle transition-colors hover:border-accent/50 hover:text-accent">
                  <Camera size={18} />
                  <span className="text-[10px]">Toevoegen</span>
                </button>
              )}
              {klaar && fotos.length === 0 && <span className="text-xs text-ink-subtle">Geen fotos vastgelegd</span>}
            </div>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden" />
          </div>

          {fout && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <AlertTriangle size={15} /> {fout}
            </div>
          )}
        </div>

        <div className="border-t border-line p-4">
          {actieLabel ? (
            <button onClick={updateStatus} disabled={bezig} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-60">
              {bezig ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {actieLabel}
            </button>
          ) : (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/15 px-4 py-3 text-sm font-semibold text-accent">
              <CheckCircle2 size={16} /> Opdracht afgerond
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AppPage() {
  const { gebruiker } = useAuth()
  const [items, setItems] = useState<Opdracht[]>([])
  const [geselecteerd, setGeselecteerd] = useState<Opdracht | null>(null)
  const [laden, setLaden] = useState(true)
  const isChauffeur = gebruiker?.rol === 'chauffeur'

  const laad = useCallback((stil = false) => {
    if (!stil) setLaden(true)
    const vandaag = new Date()
    const overWeek = new Date(vandaag)
    overWeek.setDate(vandaag.getDate() + 7)
    // Let op: `populate=*` gaat maar één niveau diep, dus fotos.afbeelding
    // (de media zelf) blijft dan leeg. Daarom expliciet nesten.
    const params =
      `populate[klant]=true&populate[container]=true&populate[chauffeur]=true` +
      `&populate[fotos][populate][afbeelding]=true` +
      `&pagination[limit]=300&sort=datum_gepland:asc` +
      `&filters[datum_gepland][$gte]=${isoDag(vandaag)}` +
      `&filters[datum_gepland][$lte]=${isoDag(overWeek)}`

    apiGet<{ data: Opdracht[] }>(`opdrachten?${params}`)
      .then(r => {
        const data = r.data ?? []
        setItems(isChauffeur ? data.filter(o => o.chauffeur?.id === gebruiker?.id) : data)
      })
      .catch(console.error)
      .finally(() => setLaden(false))
  }, [gebruiker?.id, isChauffeur])

  useEffect(() => {
    const id = window.setTimeout(laad, 0)
    return () => window.clearTimeout(id)
  }, [laad])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const vandaagAantal = items.filter(r => r.datum_gepland === isoDag(new Date())).length

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Chauffeur-app</h1>
        <p className="mt-1 text-sm text-ink-subtle">{isChauffeur ? 'Jouw ritten en containerlocaties' : 'Ritten en locaties voor chauffeurs'}</p>
      </div>

      {laden ? (
        <div className="text-sm text-ink-subtle">Laden...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid max-w-2xl grid-cols-2 gap-4">
            <KpiKaart label="Ritten komende 7 dagen" waarde={items.length} icon={ClipboardList} kleur="bg-accent/20 text-accent" />
            <KpiKaart label="Vandaag" waarde={vandaagAantal} icon={Clock} kleur="bg-blue-500/20 text-blue-600" />
          </div>

          {items.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-ink-subtle">
              <CheckCircle2 size={16} className="text-accent/50" /> Geen ritten gepland.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map(rit => <RitKaart key={rit.id} opdracht={rit} toonChauffeur={!isChauffeur} onOpen={() => setGeselecteerd(rit)} />)}
            </div>
          )}
        </div>
      )}

      {geselecteerd && (
        <OpdrachtDetailModal
          opdracht={geselecteerd}
          onClose={() => setGeselecteerd(null)}
          onUpdated={bijgewerkt => {
            setItems(prev => prev.map(item => item.id === bijgewerkt.id ? { ...item, ...bijgewerkt } : item))
            setGeselecteerd(prev => prev ? { ...prev, ...bijgewerkt } : prev)
          }}
        />
      )}
    </div>
  )
}
