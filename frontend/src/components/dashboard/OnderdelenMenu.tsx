'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { zichtbareNav } from '@/lib/nav'
import { LogOut } from 'lucide-react'

/**
 * Volledig menu als tegels op de dashboardpagina. Op mobiel is dit de enige
 * plek waar je alles terugvindt — de tabbalk toont maar drie items. Op desktop
 * staat het naast de sidebar als snelle ingang tot alle onderdelen.
 */
export function OnderdelenMenu() {
  const { gebruiker, logout } = useAuth()
  const router = useRouter()
  // Dashboard zelf overslaan — je staat er al op.
  const items = zichtbareNav(gebruiker?.rol).filter(i => i.href !== '/dashboard')

  const uitloggen = () => { logout(); router.push('/login') }

  return (
    // Bewust een <div>, geen <section>: er is een globale regel
    // `section:not([aria-live]) { padding-top/bottom: var(--padding-section) }`
    // die anders een lompe padding bovenop dit blok legt.
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-4 py-6 text-center transition-colors hover:border-accent/40 hover:bg-accent/5 active:bg-accent/10"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
              <Icon size={24} />
            </span>
            <span className="text-sm font-medium leading-tight text-ink">{label}</span>
          </Link>
        ))}
      </div>

      {/* Account + uitloggen alleen op mobiel — op desktop zit dat in de sidebar. */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{gebruiker?.name ?? gebruiker?.username}</div>
          <div className="text-xs capitalize text-ink-subtle">{gebruiker?.rol}</div>
        </div>
        <button
          onClick={uitloggen}
          className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg bg-danger px-4 text-xs font-medium text-white transition-colors hover:bg-danger/90 active:bg-danger/80"
        >
          <LogOut size={14} /> Uitloggen
        </button>
      </div>
    </div>
  )
}
