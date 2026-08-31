'use client'
import { useEffect, type ReactNode } from 'react'
import { X, Trash2 } from 'lucide-react'

/** Rode verwijderknop voor linksonder in een bewerk-modal. */
export function VerwijderKnop({ onKlik, bezig, label = 'Verwijderen' }: {
  onKlik: () => void; bezig?: boolean; label?: string
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      disabled={bezig}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-danger px-4 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
    >
      <Trash2 size={14} /> {label}
    </button>
  )
}

export function Modal({ open, onClose, titel, children, footer, linkerActie }: {
  open: boolean
  onClose: () => void
  titel: string
  children: ReactNode
  footer?: ReactNode
  linkerActie?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Lock zowel <body> als de dashboard-scrollcontainer (<main>) zodat de
    // achtergrond niet meescrollt terwijl de modal open is.
    const main = document.querySelector('main')
    const prevBody = document.body.style.overflow
    const prevMain = main?.style.overflow ?? ''
    document.body.style.overflow = 'hidden'
    if (main) main.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBody
      if (main) main.style.overflow = prevMain
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div data-lenis-prevent className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 animate-in fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl my-auto flex flex-col max-h-[88vh] rounded-2xl border border-line bg-app shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line flex-shrink-0">
          <h2 className="text-lg font-bold text-ink">{titel}</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-subtle hover:text-ink hover:bg-fill transition-colors">
            <X size={18} />
          </button>
        </div>
        <div data-lenis-prevent className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {(footer || linkerActie) && (
          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-line flex-shrink-0">
            <div>{linkerActie}</div>
            <div className="flex items-center gap-2">{footer}</div>
          </div>
        )}
      </div>
    </div>
  )
}
