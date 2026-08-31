'use client'
import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import { Modal } from './Modal'
import { Veld, TekstVeld, GetalVeld, SelectVeld } from './fields'
import { Button } from '@/components/ui/button'

const STRAPI = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'
const mediaUrl = (u?: string) => (!u ? '' : u.startsWith('http') ? u : `${STRAPI}${u}`)
const FOTO_LABEL: Record<string, string> = { voor: 'Voor', na: 'Na', algemeen: 'Algemeen' }

interface Foto { id: number; type?: string; url: string }

export interface FactuurRecord {
  id?: number
  documentId?: string
  factuur_nummer?: string
  status?: string
  subtotaal?: number
  btw_bedrag?: number
  totaal?: number
  huur_bedrag?: number
  extra_huur_bedrag?: number
  transport_bedrag?: number
  verwerking_bedrag?: number
  factuurdatum?: string
  vervaldatum?: string
  klant?: { id: number }
}

interface Optie { id: number; label: string }

const STATUSSEN = ['concept', 'verzonden', 'betaald', 'verlopen']
const opt = (v: string[]) => v.map(x => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }))

export function FactuurModal({ open, onClose, onSaved, factuur, klanten }: {
  open: boolean; onClose: () => void; onSaved: () => void; factuur: FactuurRecord | null; klanten: Optie[]
}) {
  const nieuw = !factuur?.documentId
  const [form, setForm] = useState<FactuurRecord>({})
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [fotos, setFotos] = useState<Foto[]>([])

  // Foto's van de gekoppelde (gefactureerde) opdracht ophalen — diep populeren.
  useEffect(() => {
    if (!open || !factuur?.documentId) { setFotos([]); return }
    apiGet<{ data: any }>(`facturen/${factuur.documentId}?populate[opdracht][populate][fotos][populate][afbeelding]=true`)
      .then(r => {
        const lijst = (r.data?.opdracht?.fotos ?? []) as any[]
        setFotos(lijst.map(f => ({ id: f.id, type: f.type, url: mediaUrl(f.afbeelding?.url) })).filter(f => f.url))
      })
      .catch(console.error)
  }, [open, factuur?.documentId])

  useEffect(() => {
    if (!open) return
    setFout('')
    setForm({
      factuur_nummer: factuur?.factuur_nummer ?? '',
      status: factuur?.status ?? 'concept',
      subtotaal: factuur?.subtotaal ?? 0,
      btw_bedrag: factuur?.btw_bedrag ?? 0,
      totaal: factuur?.totaal ?? 0,
      huur_bedrag: factuur?.huur_bedrag ?? 0,
      extra_huur_bedrag: factuur?.extra_huur_bedrag ?? 0,
      transport_bedrag: factuur?.transport_bedrag ?? 0,
      verwerking_bedrag: factuur?.verwerking_bedrag ?? 0,
      factuurdatum: factuur?.factuurdatum ?? '',
      vervaldatum: factuur?.vervaldatum ?? '',
      klant: factuur?.klant,
    })
  }, [open, factuur])

  const set = <K extends keyof FactuurRecord>(k: K, v: FactuurRecord[K]) => setForm(p => ({ ...p, [k]: v }))

  const opslaan = async () => {
    if (!form.factuur_nummer?.trim()) { setFout('Factuurnummer is verplicht'); return }
    setBezig(true); setFout('')
    const data: Record<string, any> = {
      factuur_nummer: form.factuur_nummer.trim(),
      status: form.status,
      subtotaal: form.subtotaal ?? 0,
      btw_bedrag: form.btw_bedrag ?? 0,
      totaal: form.totaal ?? 0,
      huur_bedrag: form.huur_bedrag ?? 0,
      extra_huur_bedrag: form.extra_huur_bedrag ?? 0,
      transport_bedrag: form.transport_bedrag ?? 0,
      verwerking_bedrag: form.verwerking_bedrag ?? 0,
      factuurdatum: form.factuurdatum || null,
      vervaldatum: form.vervaldatum || null,
      klant: form.klant?.id ?? null,
    }
    try {
      if (nieuw) await apiPost('facturen', { data })
      else await apiPut(`facturen/${factuur!.documentId}`, { data })
      onSaved(); onClose()
    } catch (e: any) {
      console.error(e); setFout(e?.message ?? 'Opslaan mislukt')
    } finally { setBezig(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose}
      titel={nieuw ? 'Nieuwe factuur' : `Factuur ${factuur?.factuur_nummer ?? ''} bewerken`}
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
        <Veld label="Factuurnummer *"><TekstVeld value={form.factuur_nummer ?? ''} onChange={v => set('factuur_nummer', v)} placeholder="F-2026-004" /></Veld>
        <Veld label="Status"><SelectVeld value={form.status ?? ''} onChange={v => set('status', v)} opties={opt(STATUSSEN)} /></Veld>
        <Veld label="Klant" breed>
          <SelectVeld value={form.klant?.id ?? ''} onChange={v => set('klant', v ? { id: Number(v) } : undefined)} opties={klanten.map(k => ({ value: k.id, label: k.label }))} leeg="— Kies klant —" />
        </Veld>
        <Veld label="Factuurdatum"><TekstVeld type="date" value={form.factuurdatum ?? ''} onChange={v => set('factuurdatum', v)} /></Veld>
        <Veld label="Vervaldatum"><TekstVeld type="date" value={form.vervaldatum ?? ''} onChange={v => set('vervaldatum', v)} /></Veld>
        <Veld label="Transport (€)"><GetalVeld value={form.transport_bedrag ?? 0} onChange={v => set('transport_bedrag', v)} /></Veld>
        <Veld label="Verwerking (€)"><GetalVeld value={form.verwerking_bedrag ?? 0} onChange={v => set('verwerking_bedrag', v)} /></Veld>
        <Veld label="Huur (€)"><GetalVeld value={form.huur_bedrag ?? 0} onChange={v => set('huur_bedrag', v)} /></Veld>
        <Veld label="Extra huur (€)"><GetalVeld value={form.extra_huur_bedrag ?? 0} onChange={v => set('extra_huur_bedrag', v)} /></Veld>
        <Veld label="Subtotaal (€)"><GetalVeld value={form.subtotaal ?? 0} onChange={v => set('subtotaal', v)} /></Veld>
        <Veld label="Btw (€)"><GetalVeld value={form.btw_bedrag ?? 0} onChange={v => set('btw_bedrag', v)} /></Veld>
        <Veld label="Totaal (€)" breed><GetalVeld value={form.totaal ?? 0} onChange={v => set('totaal', v)} /></Veld>

        {fotos.length > 0 && (
          <Veld label="Foto's van de opdracht" breed>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {fotos.map(f => (
                <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg border border-line">
                  <img src={f.url} alt={f.type ?? 'foto'} className="h-28 w-full object-cover transition-transform group-hover:scale-105" />
                  {f.type && <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{FOTO_LABEL[f.type] ?? f.type}</span>}
                </a>
              ))}
            </div>
          </Veld>
        )}
      </div>
      {fout && <div className="mt-4 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">{fout}</div>}
    </Modal>
  )
}
