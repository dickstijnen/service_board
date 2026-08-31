'use client'
import { useState } from 'react'
import { apiPost, apiPut } from '@/lib/api'
import { Modal } from './Modal'
import { Veld, TekstVeld } from './fields'
import { Button } from '@/components/ui/button'

export interface ChauffeurRecord {
  id?: number
  name?: string
  username?: string
  email?: string
  telefoon?: string
  geboortedatum?: string
}

export function ChauffeurModal({ open, onClose, onSaved, chauffeur }: {
  open: boolean; onClose: () => void; onSaved: () => void; chauffeur?: ChauffeurRecord | null
}) {
  return <ChauffeurModalInner key={open ? chauffeur?.id ?? 'nieuw' : 'dicht'} open={open} onClose={onClose} onSaved={onSaved} chauffeur={chauffeur ?? null} />
}

function ChauffeurModalInner({ open, onClose, onSaved, chauffeur }: {
  open: boolean; onClose: () => void; onSaved: () => void; chauffeur: ChauffeurRecord | null
}) {
  const nieuw = !chauffeur?.id
  const [naam, setNaam] = useState(chauffeur?.name ?? '')
  const [email, setEmail] = useState(chauffeur?.email ?? '')
  const [wachtwoord, setWachtwoord] = useState('')
  const [telefoon, setTelefoon] = useState(chauffeur?.telefoon ?? '')
  const [geboortedatum, setGeboortedatum] = useState(chauffeur?.geboortedatum ?? '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  const opslaan = async () => {
    setBezig(true); setFout('')
    try {
      if (nieuw) {
        if (!email.trim() || !wachtwoord.trim()) { setFout('E-mail en wachtwoord zijn verplicht'); setBezig(false); return }
        await apiPost('dashboard/chauffeur', {
          name: naam.trim() || null,
          email: email.trim(),
          password: wachtwoord,
          telefoon: telefoon.trim() || null,
          geboortedatum: geboortedatum || null,
        })
      } else {
        await apiPut(`dashboard/chauffeur/${chauffeur!.id}`, {
          name: naam.trim() || null,
          telefoon: telefoon.trim() || null,
          geboortedatum: geboortedatum || null,
        })
      }
      onSaved(); onClose()
    } catch (e: unknown) {
      console.error(e)
      setFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally { setBezig(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose}
      titel={nieuw ? 'Nieuwe chauffeur' : `${chauffeur?.name ?? chauffeur?.username ?? 'Chauffeur'} bewerken`}
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
        <Veld label="Naam" breed><TekstVeld value={naam} onChange={setNaam} placeholder="Jan de Vries" /></Veld>
        <Veld label="Telefoon"><TekstVeld value={telefoon} onChange={setTelefoon} placeholder="06 12345678" /></Veld>
        <Veld label="Geboortedatum"><TekstVeld type="date" value={geboortedatum} onChange={setGeboortedatum} /></Veld>

        {nieuw ? (
          <>
            <Veld label="E-mail" breed><TekstVeld type="email" value={email} onChange={setEmail} placeholder="jan@paterbak.nl" /></Veld>
            <Veld label="Wachtwoord" breed><TekstVeld type="password" value={wachtwoord} onChange={setWachtwoord} placeholder="Minimaal 6 tekens" /></Veld>
            <p className="text-[11px] text-ink-subtle sm:col-span-2">De chauffeur logt hiermee in op de chauffeur-app. Rol wordt automatisch op <span className="font-medium text-ink">chauffeur</span> gezet.</p>
          </>
        ) : (
          <Veld label="E-mail" breed>
            <div className="min-h-10 flex items-center rounded-lg border border-line bg-fill px-3 text-sm text-ink-subtle">{email || '—'}</div>
          </Veld>
        )}
      </div>
      {fout && <p className="text-sm text-danger mt-4">{fout}</p>}
    </Modal>
  )
}
