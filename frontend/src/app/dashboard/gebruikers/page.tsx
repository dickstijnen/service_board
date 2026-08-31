'use client'
import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, TableShell, LeegRij, Laden, StatusBadge } from '@/components/dashboard/ui'
import { datum, datumTijd, rolKleur } from '@/lib/format'
import { Mail } from 'lucide-react'

interface Gebruiker {
  id: number
  username: string
  name?: string
  email: string
  rol?: string
  confirmed?: boolean
  blocked?: boolean
  createdAt?: string
  laatst_ingelogd?: string
}

export default function GebruikersPage() {
  const [items, setItems] = useState<Gebruiker[]>([])
  const [laden, setLaden] = useState(true)

  const laad = (stil = false) => {
    if (!stil) setLaden(true)
    // /api/users (users-permissions) geeft een platte array terug, incl. het
    // custom `rol`-veld en createdAt.
    apiGet<Gebruiker[]>('users?sort=createdAt:desc&pagination[limit]=200')
      .then(u => setItems(Array.isArray(u) ? u : []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }

  useEffect(laad, [])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader titel="Gebruikers" sub={`${items.length} gebruikers · ingelogd op het platform`} />

      {laden ? <Laden /> : (
        <TableShell kolommen={['Naam', 'E-mail', 'Rol', 'Laatst ingelogd', 'Aangemaakt']}>
          {items.map(u => (
            <tr key={u.id} className="border-b border-line hover:bg-fill transition-colors">
              <td className="px-4 py-3">
                <div className="text-sm text-ink">{u.name ?? u.username}</div>
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-muted"><Mail size={12} className="text-ink-subtle" />{u.email}</span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={u.rol ?? '—'} kleur={rolKleur} vol />
              </td>
              <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">{u.laatst_ingelogd ? datumTijd(u.laatst_ingelogd) : <span className="text-ink-subtle">Nooit</span>}</td>
              <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">{datum(u.createdAt)}</td>
            </tr>
          ))}
          {items.length === 0 && <LeegRij kolommen={5} tekst="Geen gebruikers gevonden" />}
        </TableShell>
      )}
    </div>
  )
}
