'use client'
import { useEffect, useRef, useState } from 'react'
import { apiPost, apiPut, apiDelete } from '@/lib/api'
import { Modal, VerwijderKnop } from './Modal'
import { Veld, TekstVeld, GetalVeld, TextareaVeld, SelectVeld, SchakelVeld } from './fields'
import { LocationPicker } from './LocationPicker'
import { KlantModal, type KlantRecord } from './KlantModal'
import { Button } from '@/components/ui/button'
import { BADGE, StatusBadge } from './ui'
import { bakPin, formaatLabel, klantNaam, containerStatusKleur, containerStatusLabel } from '@/lib/format'
import { Plus } from 'lucide-react'

export interface OpdrachtRecord {
  id?: number
  documentId?: string
  opdracht_nummer?: number
  type?: string
  status?: string
  afval_soort?: string
  adres?: string
  straat?: string
  huisnummer?: string
  postcode?: string
  plaatsnaam?: string
  locatie_lat?: number
  locatie_lng?: number
  datum_gepland?: string
  voorkeur_tijdstip?: string
  betaling_type?: string
  extra_huur_actief?: boolean
  extra_huur_dagen?: number
  opmerkingen?: string
  klant?: { id: number }
  container?: { id: number }
  chauffeur?: { id: number }
}

interface Optie { id: number; label: string }
export interface ContainerOptie extends Optie { code: string; formaat: string; status: string; gesloten: boolean }

// Numerieke grootte uit de formaat-code, voor sorteren groot → klein. Niet-
// numerieke formaten (portaal, haak, zeecontainer, …) belanden achteraan.
const maatWaarde = (formaat: string) => Number(formaat.match(/(\d+)\s*m3/i)?.[1] ?? -1)

// Afbeelding per afvalsoort uit /public/img/type. 'afval' = grof afval → grof.png.
const afvalAfbeelding = (soort: string) => `/img/type/${soort === 'afval' ? 'grof' : soort}.png`
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const TYPES = ['plaatsing', 'ophaling', 'wisseling']
const STATUSSEN = ['gepland', 'onderweg', 'geplaatst', 'opgehaald', 'gewisseld', 'geannuleerd']
const AFVAL = ['puin', 'afval', 'hout', 'grond', 'groen', 'gemengd', 'overig']
const BETALING = ['factuur', 'contant']
const TIJDSTIPPEN = ['ochtend', 'middag', 'avond']

const enumOpties = (vals: string[]) => vals.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))

// Splitst een bestaand adres ("Dorpsstraat 12A") in straat + huisnummer.
function splitAdres(adres?: string): { straat: string; huisnummer: string } {
  const m = (adres ?? '').trim().match(/^(.*?)\s*(\d+\s*\w*)$/)
  return m ? { straat: m[1].trim(), huisnummer: m[2].trim() } : { straat: (adres ?? '').trim(), huisnummer: '' }
}

function beginForm(opdracht: OpdrachtRecord | null): OpdrachtRecord {
  const { straat, huisnummer } = splitAdres(opdracht?.adres)
  return {
    type: opdracht?.type ?? 'plaatsing',
    status: opdracht?.status ?? 'gepland',
    afval_soort: opdracht?.afval_soort ?? 'afval',
    adres: opdracht?.adres ?? '',
    straat,
    huisnummer,
    postcode: opdracht?.postcode ?? '',
    plaatsnaam: opdracht?.plaatsnaam ?? '',
    locatie_lat: opdracht?.locatie_lat,
    locatie_lng: opdracht?.locatie_lng,
    datum_gepland: opdracht?.datum_gepland ?? '',
    voorkeur_tijdstip: opdracht?.voorkeur_tijdstip ?? '',
    betaling_type: opdracht?.betaling_type ?? 'factuur',
    extra_huur_actief: opdracht?.extra_huur_actief ?? false,
    extra_huur_dagen: opdracht?.extra_huur_dagen ?? 0,
    opmerkingen: opdracht?.opmerkingen ?? '',
    klant: opdracht?.klant,
    container: opdracht?.container,
    chauffeur: opdracht?.chauffeur,
  }
}

export function OpdrachtModal({ open, onClose, onSaved, opdracht, klanten, containers, chauffeurs, onKlantToegevoegd }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  opdracht: OpdrachtRecord | null
  klanten: Optie[]
  containers: ContainerOptie[]
  chauffeurs: Optie[]
  onKlantToegevoegd?: (k: Optie) => void
}) {
  return (
    <OpdrachtModalInner
      key={open ? opdracht?.documentId ?? 'nieuw' : 'gesloten'}
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      opdracht={opdracht}
      klanten={klanten}
      containers={containers}
      chauffeurs={chauffeurs}
      onKlantToegevoegd={onKlantToegevoegd}
    />
  )
}

function OpdrachtModalInner({ open, onClose, onSaved, opdracht, klanten, containers, chauffeurs, onKlantToegevoegd }: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  opdracht: OpdrachtRecord | null
  klanten: Optie[]
  containers: ContainerOptie[]
  chauffeurs: Optie[]
  onKlantToegevoegd?: (k: Optie) => void
}) {
  const nieuw = !opdracht?.documentId
  const [form, setForm] = useState<OpdrachtRecord>(() => beginForm(opdracht))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [klantModalOpen, setKlantModalOpen] = useState(false)
  const [adresModus, setAdresModus] = useState<'kaart' | 'handmatig'>('kaart')
  // Containerkeuze in twee stappen: eerst formaat, dan de beschikbare bakken.
  const [gekozenFormaat, setGekozenFormaat] = useState<string>(() =>
    containers.find(c => c.id === opdracht?.container?.id)?.formaat ?? '')
  const adresTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (adresTimer.current) window.clearTimeout(adresTimer.current)
    }
  }, [])

  const set = <K extends keyof OpdrachtRecord>(k: K, v: OpdrachtRecord[K]) => setForm(p => ({ ...p, [k]: v }))
  const setAdresveld = (k: 'straat' | 'huisnummer' | 'postcode' | 'plaatsnaam', v: string) => {
    setForm(p => ({ ...p, [k]: v }))

    // Handmatig gewijzigd adres → stale coördinaten weggooien (server geocodet later).
    if (adresTimer.current) window.clearTimeout(adresTimer.current)
    adresTimer.current = window.setTimeout(() => {
      setForm(p => ({ ...p, locatie_lat: undefined, locatie_lng: undefined }))
      adresTimer.current = null
    }, 900)
  }
  const setLocatie = (locatie: { straat: string; huisnummer: string; postcode: string; plaatsnaam: string; lat: number; lng: number; source: 'address' | 'map' }) => {
    if (adresTimer.current) {
      window.clearTimeout(adresTimer.current)
      adresTimer.current = null
    }

    // Kaart/zoek-selectie vult straat/huisnummer/postcode/plaatsnaam + coördinaten.
    setForm(p => ({
      ...p,
      straat: locatie.straat || p.straat,
      huisnummer: locatie.huisnummer || p.huisnummer,
      postcode: locatie.postcode || p.postcode,
      plaatsnaam: locatie.plaatsnaam || p.plaatsnaam,
      locatie_lat: locatie.lat,
      locatie_lng: locatie.lng,
    }))
  }

  const opslaan = async () => {
    // Client-side validatie: voorkomt een trage, mislukte opslag-call op live.
    const missers: string[] = []
    if (!form.klant?.id) missers.push('Klant')
    if (!form.container?.id) missers.push('Container')
    if (!form.straat?.trim()) missers.push('Straat')
    if (!form.huisnummer?.trim()) missers.push('Huisnummer')
    if (!form.postcode?.trim()) missers.push('Postcode')
    if (!form.plaatsnaam?.trim()) missers.push('Plaatsnaam')
    if (missers.length) {
      setFout(`Vul deze velden nog in voordat je opslaat: ${missers.join(', ')}.`)
      return
    }

    setBezig(true); setFout('')
    const adres = [form.straat, form.huisnummer].map(s => s?.trim()).filter(Boolean).join(' ')
    const data: Record<string, unknown> = {
      type: form.type,
      status: form.status,
      afval_soort: form.afval_soort,
      adres: adres || null,
      postcode: form.postcode || null,
      plaatsnaam: form.plaatsnaam || null,
      locatie_lat: form.locatie_lat ?? null,
      locatie_lng: form.locatie_lng ?? null,
      datum_gepland: form.datum_gepland || null,
      voorkeur_tijdstip: form.voorkeur_tijdstip || null,
      betaling_type: form.betaling_type,
      extra_huur_actief: form.extra_huur_actief,
      extra_huur_dagen: form.extra_huur_dagen ?? 0,
      opmerkingen: form.opmerkingen || null,
      klant: form.klant?.id ?? null,
      container: form.container?.id ?? null,
      chauffeur: form.chauffeur?.id ?? null,
    }
    try {
      if (nieuw) await apiPost('opdrachten', { data })
      else await apiPut(`opdrachten/${opdracht!.documentId}`, { data })
      onSaved()
      onClose()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  const verwijder = async () => {
    if (!opdracht?.documentId) return
    if (!confirm(`Opdracht #${opdracht.opdracht_nummer ?? ''} definitief verwijderen?`)) return
    setBezig(true); setFout('')
    try {
      await apiDelete(`opdrachten/${opdracht.documentId}`)
      onSaved(); onClose()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setBezig(false)
    }
  }

  const relOpties = (lijst: Optie[]) => lijst.map(o => ({ value: o.id, label: o.label }))

  // Formaten uniek, gesorteerd groot → klein. Open/gesloten + status tonen we
  // op de bakjes zelf. We tonen álle bakken van een formaat (ook niet-beschikbare).
  const formaatOpties = Array.from(new Set(containers.map(c => c.formaat)))
    .sort((a, b) => maatWaarde(b) - maatWaarde(a))
    .map(f => ({ value: f, label: formaatLabel(f) }))
  const bakkenVanFormaat = containers.filter(c => c.formaat === gekozenFormaat)

  const kiesFormaat = (f: string) => {
    setGekozenFormaat(f)
    if (form.container && !containers.some(c => c.id === form.container!.id && c.formaat === f)) {
      set('container', undefined)
    }
  }

  const handleNieuweKlant = (saved?: KlantRecord & { id: number }) => {
    if (!saved?.id) return
    onKlantToegevoegd?.({ id: saved.id, label: klantNaam(saved as any) })
    set('klant', { id: saved.id })
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      titel={nieuw ? 'Nieuwe opdracht' : `Opdracht #${opdracht?.opdracht_nummer ?? ''} bewerken`}
      linkerActie={!nieuw && <VerwijderKnop onKlik={verwijder} bezig={bezig} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="text-ink-muted hover:text-ink hover:bg-fill">Annuleren</Button>
          <Button onClick={opslaan} disabled={bezig} className="bg-accent hover:bg-accent/90 text-white">
            {bezig ? 'Opslaan...' : nieuw ? 'Aanmaken' : 'Opslaan'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fout && (
          <div className="sm:col-span-2 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">{fout}</div>
        )}
        <Veld label="Type" breed={nieuw}><SelectVeld value={form.type ?? ''} onChange={v => set('type', v)} opties={enumOpties(TYPES)} /></Veld>
        {/* Status kies je pas bij bewerken; een nieuwe opdracht start op 'gepland'
            en landt ongepland in de backlog. */}
        {!nieuw && <Veld label="Status"><SelectVeld value={form.status ?? ''} onChange={v => set('status', v)} opties={enumOpties(STATUSSEN)} /></Veld>}

        <Veld label="Klant" breed>
          <div className="flex gap-2">
            <div className="flex-1">
              <SelectVeld value={form.klant?.id ?? ''} onChange={v => set('klant', v ? { id: Number(v) } : undefined)} opties={relOpties(klanten)} leeg="— Kies klant —" />
            </div>
            <button
              type="button"
              onClick={() => setKlantModalOpen(true)}
              title="Nieuwe klant toevoegen"
              aria-label="Nieuwe klant toevoegen"
              className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent/90"
            >
              <Plus size={18} />
            </button>
          </div>
        </Veld>

        <Veld label="Container" breed>
          <div className="space-y-2">
            <SelectVeld value={gekozenFormaat} onChange={kiesFormaat} opties={formaatOpties} leeg="— Kies formaat —" />
            {gekozenFormaat && (
              bakkenVanFormaat.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-subtle">Geen beschikbare containers van dit formaat</p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {bakkenVanFormaat.map(c => {
                    const actief = form.container?.id === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set('container', { id: c.id })}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${actief ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'}`}
                      >
                        <img src={bakPin(c.formaat)} alt="" className="h-6 w-[42px] flex-shrink-0 object-contain object-left" />
                        <span className="font-mono">{c.code}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {c.gesloten && <span className={`${BADGE} bg-ink/10 text-ink`}>Gesloten</span>}
                          <StatusBadge status={c.status} kleur={containerStatusKleur} labels={containerStatusLabel} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </Veld>

        <Veld label="Chauffeur" breed>
          <SelectVeld value={form.chauffeur?.id ?? ''} onChange={v => set('chauffeur', v ? { id: Number(v) } : undefined)} opties={relOpties(chauffeurs)} leeg="— Geen —" />
        </Veld>
        <Veld label="Afvalsoort" breed>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {AFVAL.map(soort => {
              const actief = form.afval_soort === soort
              return (
                <button
                  key={soort}
                  type="button"
                  onClick={() => set('afval_soort', soort)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors ${actief ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'}`}
                >
                  <img src={afvalAfbeelding(soort)} alt="" className="h-10 w-auto object-contain" />
                  {cap1(soort)}
                </button>
              )
            })}
          </div>
        </Veld>

        <Veld label="Locatie" breed>
          <div className="mb-2 flex gap-1 rounded-xl border border-line bg-surface p-1">
            {(['kaart', 'handmatig'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setAdresModus(m)}
                className={`min-h-10 flex-1 rounded-lg text-xs font-semibold transition-colors ${adresModus === m ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                {m === 'kaart' ? 'Op de kaart' : 'Handmatig invullen'}
              </button>
            ))}
          </div>

          {adresModus === 'kaart' ? (
            <>
              <LocationPicker
                lat={form.locatie_lat}
                lng={form.locatie_lng}
                adres={[[form.straat, form.huisnummer].filter(Boolean).join(' '), form.postcode, form.plaatsnaam].filter(Boolean).join(', ')}
                onSelect={setLocatie}
              />
              <p className="mt-2 text-[11px] text-ink-subtle">
                {[[form.straat, form.huisnummer].filter(Boolean).join(' '), form.postcode, form.plaatsnaam].filter(Boolean).join(', ') || 'Zoek een adres of klik op de kaart'}
                {form.locatie_lat != null && form.locatie_lng != null && ` · ${form.locatie_lat.toFixed(5)}, ${form.locatie_lng.toFixed(5)}`}
              </p>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Veld label="Straat"><TekstVeld value={form.straat ?? ''} onChange={v => setAdresveld('straat', v)} placeholder="Dorpsstraat" /></Veld>
              <Veld label="Huisnummer"><TekstVeld value={form.huisnummer ?? ''} onChange={v => setAdresveld('huisnummer', v)} placeholder="12A" /></Veld>
              <Veld label="Postcode"><TekstVeld value={form.postcode ?? ''} onChange={v => setAdresveld('postcode', v)} placeholder="1234 AB" /></Veld>
              <Veld label="Plaatsnaam"><TekstVeld value={form.plaatsnaam ?? ''} onChange={v => setAdresveld('plaatsnaam', v)} /></Veld>
            </div>
          )}
        </Veld>

        {/* Bij aanmaken plan je niet meteen: de opdracht landt ongepland in de
            backlog onderaan de chauffeursplanning en wordt daar op een dag +
            chauffeur gesleept. Datum/tijdstip verschijnen dus pas bij bewerken. */}
        {nieuw ? (
          <div className="rounded-lg border border-dashed border-line bg-fill px-3 py-2 text-xs text-ink-muted sm:col-span-2">
            Nog niet inplannen — deze opdracht komt in <span className="font-medium text-ink">Nog in te plannen</span> onderaan de planning. Sleep 'm daar op een chauffeur en dag.
          </div>
        ) : (
          <>
            <Veld label="Geplande datum"><TekstVeld type="date" value={form.datum_gepland ?? ''} onChange={v => set('datum_gepland', v)} /></Veld>
            <Veld label="Voorkeur tijdstip"><SelectVeld value={form.voorkeur_tijdstip ?? ''} onChange={v => set('voorkeur_tijdstip', v)} opties={enumOpties(TIJDSTIPPEN)} leeg="— Geen voorkeur —" /></Veld>
          </>
        )}

        <Veld label="Betaling"><SelectVeld value={form.betaling_type ?? ''} onChange={v => set('betaling_type', v)} opties={enumOpties(BETALING)} /></Veld>

        {/* Extra huur is pas relevant zodra de opdracht loopt (klant gekoppeld),
            dus niet bij aanmaken — pas bij bewerken. */}
        {!nieuw && (
          <>
            <Veld label="Extra huur (dagen)"><GetalVeld value={form.extra_huur_dagen ?? 0} onChange={v => set('extra_huur_dagen', v)} /></Veld>
            <Veld label="Extra huur actief" breed>
              <SchakelVeld value={!!form.extra_huur_actief} onChange={v => set('extra_huur_actief', v)} label={form.extra_huur_actief ? 'Ja, extra huur loopt' : 'Nee'} />
            </Veld>
          </>
        )}

        <Veld label="Opmerkingen" breed><TextareaVeld value={form.opmerkingen ?? ''} onChange={v => set('opmerkingen', v)} /></Veld>
      </div>

    </Modal>

    <KlantModal
      open={klantModalOpen}
      onClose={() => setKlantModalOpen(false)}
      onSaved={handleNieuweKlant}
      klant={null}
    />
    </>
  )
}
