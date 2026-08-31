'use client'
import type { ReactNode } from 'react'

const inputClass =
  'w-full min-h-10 px-3 py-2 rounded-lg bg-surface border border-line text-sm text-ink placeholder:text-ink-subtle outline-none focus:border-accent/60 transition-colors'

/**
 * Eigen chevron voor selects. Het native pijltje plakt tegen de rechterrand en
 * ziet er per browser anders uit, dus zetten we 'm uit met appearance-none en
 * tekenen we hem zelf op 12px van de rand. Combineer met `selectRuimte` zodat
 * lange labels niet onder het pijltje doorlopen.
 */
const CHEVRON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235a626b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>"

export const selectChevron = {
  backgroundImage: `url("${CHEVRON}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.75rem center',
  backgroundSize: '14px 14px',
} as const

/** appearance-none + ruimte rechts voor de eigen chevron. */
export const selectRuimte = 'appearance-none cursor-pointer pr-10'

export function Veld({ label, children, breed }: { label: string; children: ReactNode; breed?: boolean }) {
  return (
    <div className={breed ? 'sm:col-span-2' : ''}>
      <label className="block text-xs text-ink-subtle mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function TekstVeld({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
}

export function GetalVeld({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={inputClass}
    />
  )
}

export function TextareaVeld({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className={`${inputClass} resize-none`}
    />
  )
}

export function SelectVeld({ value, onChange, opties, leeg }: {
  value: string | number
  onChange: (v: string) => void
  opties: { value: string | number; label: string }[]
  leeg?: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={selectChevron}
      className={`${inputClass} ${selectRuimte}`}
    >
      {leeg !== undefined && <option value="">{leeg}</option>}
      {opties.map(o => (
        <option key={o.value} value={o.value} className="bg-app">{o.label}</option>
      ))}
    </select>
  )
}

export function SchakelVeld({ value, onChange, label, disabled = false }: {
  value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="flex items-center gap-3 w-full min-h-10 px-3 py-2 rounded-lg bg-surface border border-line text-sm text-ink-muted hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-muted"
    >
      <span className={`relative w-9 h-5 rounded-md transition-colors flex-shrink-0 ${value ? 'bg-accent' : 'bg-fill'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-sm bg-surface transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
      {label}
    </button>
  )
}
