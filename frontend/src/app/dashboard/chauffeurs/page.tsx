'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, Laden, Card, NieuwKnop } from '@/components/dashboard/ui'
import { ChauffeurModal, type ChauffeurRecord } from '@/components/dashboard/ChauffeurModal'
import { datum } from '@/lib/format'
import { Truck, Mail, CalendarRange, ClipboardList, Phone, Cake, Pencil } from 'lucide-react'

interface Gebruiker {
  id: number
  username: string
  name?: string
  email: string
  rol?: string
  telefoon?: string
  geboortedatum?: string
}

export default function ChauffeursPage() {
  const [chauffeurs, setChauffeurs] = useState<Gebruiker[]>([])
  const [laden, setLaden] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<ChauffeurRecord | null>(null)
  const [ritten, setRitten] = useState<Record<number, number>>({})
  const jaar = new Date().getFullYear()

  const laad = () => {
    apiGet<Gebruiker[]>('users?filters[rol][$eq]=chauffeur&pagination[limit]=100')
      .then(u => setChauffeurs(Array.isArray(u) ? u : []))
      .catch(console.error)
      .finally(() => setLaden(false))

    // Aantal ritten (opdrachten) dit jaar per chauffeur.
    apiGet<{ data: { chauffeur?: { id: number } }[] }>(
      `opdrachten?filters[datum_gepland][$gte]=${jaar}-01-01&filters[datum_gepland][$lte]=${jaar}-12-31&fields[0]=id&populate[chauffeur][fields][0]=id&pagination[limit]=2000`
    )
      .then(r => {
        const telling: Record<number, number> = {}
        ;(r.data ?? []).forEach(o => { const id = o.chauffeur?.id; if (id) telling[id] = (telling[id] ?? 0) + 1 })
        setRitten(telling)
      })
      .catch(console.error)
  }

  useEffect(laad, [])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Chauffeurs"
        sub={`${chauffeurs.length} chauffeurs`}
        actie={<NieuwKnop label="Nieuwe chauffeur" onClick={() => { setBewerken(null); setModalOpen(true) }} />}
      />

      {laden ? <Laden /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {chauffeurs.map(c => (
            <Card key={c.id} className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                  <Truck size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{c.name ?? c.username}</div>
                  <div className="text-xs text-ink-subtle flex items-center gap-1 truncate"><Mail size={11} />{c.email}</div>
                </div>
                <button
                  onClick={() => { setBewerken(c); setModalOpen(true) }}
                  title="Chauffeur bewerken"
                  className="inline-flex items-center rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-fill hover:text-accent flex-shrink-0"
                >
                  <Pencil size={14} />
                </button>
              </div>
              <div className="mb-4 space-y-1 text-xs text-ink-subtle">
                <div className="flex items-center gap-1.5"><Phone size={11} className="flex-shrink-0" />{c.telefoon || '—'}</div>
                <div className="flex items-center gap-1.5"><Cake size={11} className="flex-shrink-0" />{c.geboortedatum ? datum(c.geboortedatum) : '—'}</div>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/planning?chauffeur=${c.id}`}
                  className="flex flex-1 min-h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-medium text-white hover:bg-accent/90 transition-colors">
                  <CalendarRange size={13} /> Planning
                </Link>
                <Link href={`/dashboard/opdrachten?chauffeur=${c.id}`}
                  title="Bekijk alle opdrachten van deze chauffeur"
                  className="flex flex-1 min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-accent">
                  <ClipboardList size={13} /> {ritten[c.id] ?? 0} opdrachten
                </Link>
              </div>
            </Card>
          ))}
          {chauffeurs.length === 0 && (
            <div className="text-ink-subtle text-sm">Geen chauffeurs gevonden</div>
          )}
        </div>
      )}

      <ChauffeurModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={laad} chauffeur={bewerken} />
    </div>
  )
}
