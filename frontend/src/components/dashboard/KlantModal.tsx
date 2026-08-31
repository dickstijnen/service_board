'use client'
import { useEffect, useState } from 'react'
import { apiPost, apiPut, apiDelete } from '@/lib/api'
import { Modal, VerwijderKnop } from './Modal'
import { Veld, TekstVeld, TextareaVeld, SchakelVeld } from './fields'
import { LocationPicker, type LocatieResultaat } from './LocationPicker'
import { Button } from '@/components/ui/button'

export interface KlantRecord {
  id?: number
  documentId?: string
  bedrijfsnaam?: string
  voornaam?: string
  achternaam?: string
  contactpersoon?: string
  telefoon?: string
  email?: string
  straat?: string
  huisnummer?: string
  postcode?: string
  plaatsnaam?: string
  leveradres_zelfde?: boolean
  lever_straat?: string
  lever_huisnummer?: string
  lever_postcode?: string
  lever_plaatsnaam?: string
  btw_nummer?: string
  kvk_nummer?: string
  speciaal_tarief?: boolean
  speciaal_tarief_toelichting?: string
}

export function KlantModal({ open, onClose, onSaved, klant }: {
  open: boolean; onClose: () => void; onSaved: (saved?: KlantRecord & { id: number }) => void; klant: KlantRecord | null
}) {
  const nieuw = !klant?.documentId
  const [form, setForm] = useState<KlantRecord>({})
  const [soort, setSoort] = useState<'zakelijk' | 'particulier'>('zakelijk')
  const [adresModus, setAdresModus] = useState<'kaart' | 'handmatig'>('kaart')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  // Kaart/zoek-selectie vult het factuuradres (klant heeft geen coördinaten).
  const setKlantLocatie = (loc: LocatieResultaat) => setForm(p => ({
    ...p,
    straat: loc.straat || p.straat,
    huisnummer: loc.huisnummer || p.huisnummer,
    postcode: loc.postcode || p.postcode,
    plaatsnaam: loc.plaatsnaam || p.plaatsnaam,
  }))

  useEffect(() => {
    if (!open) return
    setFout('')
    // Onderscheid zakelijk/particulier hangt aan bedrijfsnaam: gevuld = zakelijk.
    setSoort(nieuw ? 'zakelijk' : (klant?.bedrijfsnaam ? 'zakelijk' : 'particulier'))
    setForm({
      bedrijfsnaam: klant?.bedrijfsnaam ?? '',
      voornaam: klant?.voornaam ?? '',
      achternaam: klant?.achternaam ?? '',
      contactpersoon: klant?.contactpersoon ?? '',
      telefoon: klant?.telefoon ?? '',
      email: klant?.email ?? '',
      straat: klant?.straat ?? '',
      huisnummer: klant?.huisnummer ?? '',
      postcode: klant?.postcode ?? '',
      plaatsnaam: klant?.plaatsnaam ?? '',
      leveradres_zelfde: klant?.leveradres_zelfde ?? true,
      lever_straat: klant?.lever_straat ?? '',
      lever_huisnummer: klant?.lever_huisnummer ?? '',
      lever_postcode: klant?.lever_postcode ?? '',
      lever_plaatsnaam: klant?.lever_plaatsnaam ?? '',
      btw_nummer: klant?.btw_nummer ?? '',
      kvk_nummer: klant?.kvk_nummer ?? '',
      speciaal_tarief: klant?.speciaal_tarief ?? false,
      speciaal_tarief_toelichting: klant?.speciaal_tarief_toelichting ?? '',
    })
  }, [open, klant])

  const set = <K extends keyof KlantRecord>(k: K, v: KlantRecord[K]) => setForm(p => ({ ...p, [k]: v }))

  const opslaan = async () => {
    // Validatie vooraf: zakelijk heeft een bedrijfsnaam nodig, particulier een naam.
    if (soort === 'zakelijk' && !form.bedrijfsnaam?.trim()) { setFout('Vul de bedrijfsnaam in.'); return }
    if (soort === 'particulier' && !form.voornaam?.trim() && !form.achternaam?.trim()) { setFout('Vul minimaal een voor- of achternaam in.'); return }

    setBezig(true); setFout('')
    const clean = (s?: string) => (s && s.trim() ? s.trim() : null)
    const data: Record<string, any> = {
      // Particulier = geen bedrijfsnaam (zo bepaalt de rest van de app het type).
      bedrijfsnaam: soort === 'zakelijk' ? clean(form.bedrijfsnaam) : null,
      voornaam: clean(form.voornaam),
      achternaam: clean(form.achternaam),
      telefoon: clean(form.telefoon),
      email: clean(form.email),
      straat: clean(form.straat),
      huisnummer: clean(form.huisnummer),
      postcode: clean(form.postcode),
      plaatsnaam: clean(form.plaatsnaam),
      leveradres_zelfde: form.leveradres_zelfde,
      lever_straat: clean(form.lever_straat),
      lever_huisnummer: clean(form.lever_huisnummer),
      lever_postcode: clean(form.lever_postcode),
      lever_plaatsnaam: clean(form.lever_plaatsnaam),
      btw_nummer: clean(form.btw_nummer),
      kvk_nummer: clean(form.kvk_nummer),
      speciaal_tarief: form.speciaal_tarief,
      speciaal_tarief_toelichting: clean(form.speciaal_tarief_toelichting),
    }
    try {
      const res = nieuw
        ? await apiPost<{ data: KlantRecord & { id: number } }>('klanten', { data })
        : await apiPut<{ data: KlantRecord & { id: number } }>(`klanten/${klant!.documentId}`, { data })
      onSaved(res?.data); onClose()
    } catch (e: any) {
      console.error(e); setFout(e?.message ?? 'Opslaan mislukt')
    } finally { setBezig(false) }
  }

  const verwijder = async () => {
    if (!klant?.documentId) return
    if (!confirm('Deze klant definitief verwijderen?')) return
    setBezig(true); setFout('')
    try {
      await apiDelete(`klanten/${klant.documentId}`)
      onSaved(); onClose()
    } catch (e: any) {
      console.error(e); setFout(e?.message ?? 'Verwijderen mislukt')
    } finally { setBezig(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose}
      titel={nieuw ? 'Nieuwe klant' : 'Klant bewerken'}
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
        <Veld label="Soort klant" breed>
          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {(['zakelijk', 'particulier'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSoort(s)}
                className={`min-h-10 flex-1 rounded-lg text-xs font-semibold transition-colors ${soort === s ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                {s === 'zakelijk' ? 'Zakelijk' : 'Particulier'}
              </button>
            ))}
          </div>
        </Veld>
        {soort === 'zakelijk' && <Veld label="Bedrijfsnaam" breed><TekstVeld value={form.bedrijfsnaam ?? ''} onChange={v => set('bedrijfsnaam', v)} /></Veld>}
        <Veld label="Voornaam"><TekstVeld value={form.voornaam ?? ''} onChange={v => set('voornaam', v)} /></Veld>
        <Veld label="Achternaam"><TekstVeld value={form.achternaam ?? ''} onChange={v => set('achternaam', v)} /></Veld>
        <Veld label="Telefoon"><TekstVeld value={form.telefoon ?? ''} onChange={v => set('telefoon', v)} /></Veld>
        <Veld label="E-mail"><TekstVeld type="email" value={form.email ?? ''} onChange={v => set('email', v)} /></Veld>

        <Veld label="Adres" breed>
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
                adres={[[form.straat, form.huisnummer].filter(Boolean).join(' '), form.postcode, form.plaatsnaam].filter(Boolean).join(', ')}
                onSelect={setKlantLocatie}
                pinSrc="/img/man.png"
                pinHoogte={32}
              />
              <p className="mt-2 text-[11px] text-ink-subtle">
                {[[form.straat, form.huisnummer].filter(Boolean).join(' '), form.postcode, form.plaatsnaam].filter(Boolean).join(', ') || 'Zoek een adres of klik op de kaart'}
              </p>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Veld label="Straat"><TekstVeld value={form.straat ?? ''} onChange={v => set('straat', v)} placeholder="Dorpsstraat" /></Veld>
              <Veld label="Huisnummer"><TekstVeld value={form.huisnummer ?? ''} onChange={v => set('huisnummer', v)} placeholder="12A" /></Veld>
              <Veld label="Postcode"><TekstVeld value={form.postcode ?? ''} onChange={v => set('postcode', v)} placeholder="1234 AB" /></Veld>
              <Veld label="Plaatsnaam"><TekstVeld value={form.plaatsnaam ?? ''} onChange={v => set('plaatsnaam', v)} /></Veld>
            </div>
          )}
        </Veld>

        {soort === 'zakelijk' && <Veld label="Btw-nummer"><TekstVeld value={form.btw_nummer ?? ''} onChange={v => set('btw_nummer', v)} /></Veld>}
        {soort === 'zakelijk' && <Veld label="KvK-nummer"><TekstVeld value={form.kvk_nummer ?? ''} onChange={v => set('kvk_nummer', v)} /></Veld>}

        <Veld label="Leveradres gelijk aan factuuradres" breed>
          <SchakelVeld value={!!form.leveradres_zelfde} onChange={v => set('leveradres_zelfde', v)} label={form.leveradres_zelfde ? 'Ja, zelfde adres' : 'Nee, apart leveradres'} />
        </Veld>

        {!form.leveradres_zelfde && (
          <>
            <Veld label="Lever straat"><TekstVeld value={form.lever_straat ?? ''} onChange={v => set('lever_straat', v)} /></Veld>
            <Veld label="Lever huisnummer"><TekstVeld value={form.lever_huisnummer ?? ''} onChange={v => set('lever_huisnummer', v)} /></Veld>
            <Veld label="Lever postcode"><TekstVeld value={form.lever_postcode ?? ''} onChange={v => set('lever_postcode', v)} /></Veld>
            <Veld label="Lever plaatsnaam"><TekstVeld value={form.lever_plaatsnaam ?? ''} onChange={v => set('lever_plaatsnaam', v)} /></Veld>
          </>
        )}

        <Veld label="Speciaal tarief" breed>
          <SchakelVeld value={!!form.speciaal_tarief} onChange={v => set('speciaal_tarief', v)} label={form.speciaal_tarief ? 'Ja' : 'Nee'} />
        </Veld>
        {form.speciaal_tarief && (
          <Veld label="Toelichting speciaal tarief" breed><TextareaVeld value={form.speciaal_tarief_toelichting ?? ''} onChange={v => set('speciaal_tarief_toelichting', v)} /></Veld>
        )}
      </div>
      {fout && <div className="mt-4 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">{fout}</div>}
    </Modal>
  )
}
