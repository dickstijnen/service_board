'use client'
import { useState } from 'react'
import { apiPost, apiPut, apiDelete } from '@/lib/api'
import { formaatLabel, containerStatusLabel } from '@/lib/format'
import { Modal, VerwijderKnop } from './Modal'
import { Veld, TekstVeld, TextareaVeld, SelectVeld, SchakelVeld } from './fields'
import { ContainerQr } from './ContainerQr'
import { Button } from '@/components/ui/button'

export interface ContainerRecord {
  id?: number
  documentId?: string
  container_code?: string
  formaat?: string
  gesloten?: boolean
  type_omschrijving?: string
  status?: string
  opmerkingen?: string
  qr_code_data?: string
  huidige_locatie_adres?: string
}

// Bij aanmaken bieden we alleen de zes standaardmaten aan; "gesloten" is een
// aparte toggle. De volledige lijst blijft voor het bewerken van bestaande
// containers met afwijkende formaten (portaal, haak, zeecontainer, …).
const MATEN = ['c1m3', 'c3m3', 'c6m3', 'c9m3', 'c20m3', 'c40m3']
const FORMATEN = ['c1m3', 'c3m3', 'c6m3', 'c9m3', 'c9m3-g', 'c20m3', 'c40m3', 'portaal', 'haak', 'laadflat', 'zeecontainer']
const STATUSSEN = ['beschikbaar', 'onderweg', 'geplaatst', 'klaar_voor_ophaling', 'opgehaald', 'onderhoud']
const opt = (v: string[]) => v.map(x => ({ value: x, label: containerStatusLabel[x] ?? x }))

function beginForm(container: ContainerRecord | null): ContainerRecord {
  return {
    container_code: container?.container_code ?? '',
    formaat: container?.formaat ?? 'c6m3',
    gesloten: container?.gesloten ?? false,
    type_omschrijving: container?.type_omschrijving ?? '',
    status: container?.status ?? 'beschikbaar',
    opmerkingen: container?.opmerkingen ?? '',
    qr_code_data: container?.qr_code_data ?? '',
  }
}

export function ContainerModal({ open, onClose, onSaved, container }: {
  open: boolean; onClose: () => void; onSaved: () => void; container: ContainerRecord | null
}) {
  return (
    <ContainerModalInner
      key={open ? container?.documentId ?? 'nieuw' : 'gesloten'}
      open={open}
      onClose={onClose}
      onSaved={onSaved}
      container={container}
    />
  )
}

function ContainerModalInner({ open, onClose, onSaved, container }: {
  open: boolean; onClose: () => void; onSaved: () => void; container: ContainerRecord | null
}) {
  const nieuw = !container?.documentId
  const [form, setForm] = useState<ContainerRecord>(() => beginForm(container))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  const set = <K extends keyof ContainerRecord>(k: K, v: ContainerRecord[K]) => setForm(p => ({ ...p, [k]: v }))

  // Vangnet voor containers van vóór de lifecycle: genereer een payload in
  // hetzelfde formaat en sla 'm meteen op, zodat de scanner 'm terugvindt.
  const genereerQr = async () => {
    if (!container?.documentId) return
    setBezig(true); setFout('')
    const nieuweQr = `CONTAINER:${crypto.randomUUID()}`
    try {
      await apiPut(`containers/${container.documentId}`, { data: { qr_code_data: nieuweQr } })
      set('qr_code_data', nieuweQr)
      onSaved()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'QR-code genereren mislukt')
    } finally { setBezig(false) }
  }

  const opslaan = async () => {
    setBezig(true); setFout('')
    const data: Record<string, unknown> = {
      formaat: form.formaat,
      gesloten: !!form.gesloten,
      status: form.status,
      opmerkingen: form.opmerkingen || null,
    }
    // Bij aanmaken laten we de containercode weg — Strapi genereert 'm (BAK-nnn).
    // Bij bewerken sturen we de (getoonde) code mee.
    if (!nieuw) data.container_code = form.container_code?.trim() || undefined
    try {
      if (nieuw) await apiPost('containers', { data })
      else await apiPut(`containers/${container!.documentId}`, { data })
      onSaved(); onClose()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally { setBezig(false) }
  }

  const verwijder = async () => {
    if (!container?.documentId) return
    if (!confirm(`Container ${container.container_code ?? ''} definitief verwijderen?`)) return
    setBezig(true); setFout('')
    try {
      await apiDelete(`containers/${container.documentId}`)
      onSaved(); onClose()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally { setBezig(false) }
  }

  // "Gesloten" is alleen relevant voor 9 m³-containers; bij andere maten staat
  // de toggle uitgegrijsd.
  const is9m3 = /9\s*m3/i.test(form.formaat ?? '')

  return (
    <Modal
      open={open} onClose={onClose}
      titel={nieuw ? 'Nieuwe container' : `Container ${container?.container_code ?? ''} bewerken`}
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
        {/* Containercode wordt bij aanmaken automatisch door Strapi gezet (BAK-nnn);
            alleen bij bewerken tonen. */}
        {!nieuw && <Veld label="Containercode"><TekstVeld value={form.container_code ?? ''} onChange={v => set('container_code', v)} placeholder="BAK-006" /></Veld>}
        <Veld label="Formaat"><SelectVeld value={form.formaat ?? ''} onChange={v => { set('formaat', v); if (!/9\s*m3/i.test(v)) set('gesloten', false) }} opties={(nieuw ? MATEN : FORMATEN).map(x => ({ value: x, label: formaatLabel(x) }))} /></Veld>
        <Veld label="Gesloten container">
          <SchakelVeld
            value={!!form.gesloten}
            onChange={v => set('gesloten', v)}
            disabled={!is9m3}
            label={!is9m3 ? 'Alleen bij 9 m³' : form.gesloten ? 'Ja, gesloten' : 'Nee, open'}
          />
        </Veld>
        {/* Status pas bij bewerken — bij aanmaken start 'ie op 'beschikbaar'. */}
        {!nieuw && <Veld label="Status"><SelectVeld value={form.status ?? ''} onChange={v => set('status', v)} opties={opt(STATUSSEN)} /></Veld>}
        <Veld label="Opmerkingen" breed><TextareaVeld value={form.opmerkingen ?? ''} onChange={v => set('opmerkingen', v)} /></Veld>

        <Veld label="QR-code" breed>
          {nieuw ? (
            <p className="rounded-lg border border-dashed border-line p-4 text-xs text-ink-subtle">
              De QR-code wordt automatisch aangemaakt zodra je de container opslaat.
            </p>
          ) : (
            <ContainerQr
              code={form.container_code ?? ''}
              waarde={form.qr_code_data}
              onGenereer={genereerQr}
              bezig={bezig}
            />
          )}
        </Veld>
      </div>
      {fout && <p className="text-sm text-danger mt-4">{fout}</p>}
    </Modal>
  )
}
