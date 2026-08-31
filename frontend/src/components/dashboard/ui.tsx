'use client'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Vierkante 40×40 toevoegen-knop — alleen een plus-icoon, label zit in aria-label/title. */
export function NieuwKnop({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="size-10 p-0 bg-accent hover:bg-accent/90 text-white"
    >
      <Plus className="size-5" />
    </Button>
  )
}

export function PageHeader({ titel, sub, actie }: { titel: string; sub?: string; actie?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">{titel}</h1>
        {sub && <p className="mt-0.5 text-xs text-ink-subtle sm:text-sm">{sub}</p>}
      </div>
      {actie && <div className="flex flex-shrink-0 items-center gap-2">{actie}</div>}
    </div>
  )
}

/**
 * Basisvorm voor élk status-/typelabel in het dashboard: min. 32px hoog, px-4.
 * Standaard op contentbreedte (inline-flex); in een tabelcel maakt `StatusBadge`
 * met `vol` 'm w-full. Gebruik `StatusBadge` waar een kleurmap bestaat, anders
 * deze constante met je eigen bg/text-klassen erachter.
 */
export const BADGE = 'inline-flex min-h-8 flex-shrink-0 items-center justify-center rounded-md px-4 text-xs font-medium whitespace-nowrap'

/**
 * `vol` → w-full (voor in een tabelcel, zodat de badge de kolom vult). Zonder
 * `vol` blijft 'ie op contentbreedte (w-fit) — full-width buiten een tabel is
 * overdreven.
 */
export function StatusBadge({ status, kleur, vol = false, labels }: { status: string; kleur: Record<string, string>; vol?: boolean; labels?: Record<string, string> }) {
  const tekst = labels?.[status]
  return (
    <span className={`${BADGE} ${tekst ? '' : 'capitalize'} ${vol ? 'w-full' : ''} ${kleur[status] ?? 'bg-fill text-ink-muted'}`}>
      {tekst ?? status}
    </span>
  )
}

/**
 * Buitenkant die FilterPills en ZoekVeld delen, zodat ze exact even hoog zijn.
 * Horizontaal scrollbaar: met zeven filters past het niet op een telefoon.
 */
const FILTER_SHELL = 'flex gap-1 overflow-x-auto bg-surface border border-line rounded-xl p-1'

/**
 * Filterbalk boven een lijst. Zet de pills links en een eventueel zoekveld
 * rechts; beide zitten in dezelfde schil, dus ze lijnen boven én onder uit.
 */
export function FilterRij({ children }: { children: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3">{children}</div>
}

export function ZoekVeld({ waarde, onWijzig, placeholder }: {
  waarde: string
  onWijzig: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className={`${FILTER_SHELL} w-full sm:w-auto`}>
      <input
        value={waarde}
        onChange={e => onWijzig(e.target.value)}
        placeholder={placeholder}
        className="min-h-10 w-full rounded-lg bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-subtle sm:w-56"
      />
    </div>
  )
}

export function FilterPills({ opties, actief, onKies }: {
  opties: { value: string; label: string }[]
  actief: string
  onKies: (v: string) => void
}) {
  return (
    <div className={FILTER_SHELL}>
      {opties.map(o => (
        <button
          key={o.value}
          onClick={() => onKies(o.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 sm:px-5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            actief === o.value
              ? 'bg-accent text-white'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface ${className}`}>
      {children}
    </div>
  )
}

export function TableShell({ kolommen, children }: { kolommen: ReactNode[]; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-line">
            {kolommen.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs text-ink-subtle tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function LeegRij({ kolommen, tekst }: { kolommen: number; tekst: string }) {
  return (
    <tr>
      <td colSpan={kolommen} className="px-4 py-10 text-center text-ink-subtle text-sm">
        {tekst}
      </td>
    </tr>
  )
}

export function Laden() {
  return <div className="text-ink-subtle text-sm">Laden...</div>
}
