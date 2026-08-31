'use client'
import { useEffect, useState } from 'react'
import { apiGet, apiPut } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, FilterPills, FilterRij, Laden, Card } from '@/components/dashboard/ui'
import { datum } from '@/lib/format'
import { Bell, BellOff, Check, Package, ClipboardList, Cake } from 'lucide-react'

interface Melding {
  id: number
  documentId: string
  type?: string
  titel?: string
  bericht?: string
  gelezen?: boolean
  createdAt?: string
  container?: { container_code?: string }
  opdracht?: { opdracht_nummer?: number }
}

interface JarigeUser { id: number; name?: string; username?: string; geboortedatum?: string }

export default function MeldingenPage() {
  const [items, setItems] = useState<Melding[]>([])
  const [verjaardagen, setVerjaardagen] = useState<Melding[]>([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('')

  const laad = () => {
    apiGet<{ data: Melding[] }>('meldingen?populate=*&sort=createdAt:desc&pagination[limit]=200')
      .then(r => setItems(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))

    // Verjaardag-meldingen: berekend op de dag zelf (geen opgeslagen records).
    apiGet<JarigeUser[]>('users?filters[rol][$eq]=chauffeur&pagination[limit]=100')
      .then(list => {
        const nu = new Date()
        const mm = nu.getMonth(), dd = nu.getDate()
        const jarig = (Array.isArray(list) ? list : []).filter(u => {
          if (!u.geboortedatum) return false
          const g = new Date(u.geboortedatum + 'T12:00:00')
          return g.getMonth() === mm && g.getDate() === dd
        })
        setVerjaardagen(jarig.map((u, i) => {
          const g = new Date(u.geboortedatum! + 'T12:00:00')
          const naam = u.name ?? u.username ?? 'Chauffeur'
          return {
            id: -1000 - i,
            documentId: '',
            type: 'verjaardag',
            titel: `${naam} is jarig 🎂`,
            bericht: `${naam} wordt vandaag ${nu.getFullYear() - g.getFullYear()} jaar.`,
            gelezen: false,
            createdAt: nu.toISOString(),
          } as Melding
        }))
      })
      .catch(console.error)
  }

  useEffect(laad, [])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const markeerGelezen = async (m: Melding) => {
    setItems(prev => prev.map(x => x.id === m.id ? { ...x, gelezen: true } : x))
    try {
      await apiPut(`meldingen/${m.documentId}`, { data: { gelezen: true } })
    } catch (e) {
      console.error(e)
      laad()
    }
  }

  const markeerAlles = async () => {
    const ongelezen = items.filter(m => !m.gelezen)
    setItems(prev => prev.map(x => ({ ...x, gelezen: true })))
    await Promise.allSettled(ongelezen.map(m => apiPut(`meldingen/${m.documentId}`, { data: { gelezen: true } })))
  }

  const alle = [...verjaardagen, ...items]
  const gefilterd = alle.filter(m =>
    filter === '' ? true : filter === 'ongelezen' ? !m.gelezen : m.gelezen
  )
  const aantalOngelezen = items.filter(m => !m.gelezen).length

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Meldingen"
        sub={`${aantalOngelezen} ongelezen van ${items.length}`}
        actie={aantalOngelezen > 0 && (
          <button onClick={markeerAlles} className="text-xs text-ink-muted hover:text-ink flex items-center gap-1.5 min-h-10 px-4 py-2 rounded-lg bg-fill transition-colors">
            <Check size={14} /> Alles als gelezen
          </button>
        )}
      />

      <FilterRij>
        <FilterPills
        actief={filter}
        onKies={setFilter}
        opties={[
          { value: '', label: 'Alles' },
          { value: 'ongelezen', label: 'Ongelezen' },
          { value: 'gelezen', label: 'Gelezen' },
        ]}
        />
      </FilterRij>

      {laden ? <Laden /> : (
        <div className="space-y-2">
          {gefilterd.map(m => (
            <Card key={m.id} className={`p-4 flex items-start gap-4 ${m.gelezen ? 'opacity-50' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.type === 'verjaardag' ? 'bg-accent/15 text-accent' : m.gelezen ? 'bg-surface text-ink-subtle' : 'bg-accent/15 text-accent'}`}>
                {m.type === 'verjaardag' ? <Cake size={16} /> : m.gelezen ? <BellOff size={16} /> : <Bell size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink">{m.titel ?? m.type ?? 'Melding'}</span>
                  {m.container?.container_code && (
                    <span className="text-xs text-ink-subtle flex items-center gap-1"><Package size={11} />{m.container.container_code}</span>
                  )}
                  {m.opdracht?.opdracht_nummer && (
                    <span className="text-xs text-ink-subtle flex items-center gap-1"><ClipboardList size={11} />#{m.opdracht.opdracht_nummer}</span>
                  )}
                </div>
                {m.bericht && <p className="text-sm text-ink-muted mt-0.5">{m.bericht}</p>}
                <p className="text-xs text-ink-subtle mt-1">{datum(m.createdAt)}</p>
              </div>
              {!m.gelezen && m.documentId && (
                <button onClick={() => markeerGelezen(m)} title="Markeer als gelezen" className="w-10 h-10 -m-1 rounded-lg flex items-center justify-center text-ink-subtle hover:text-accent hover:bg-fill transition-colors flex-shrink-0">
                  <Check size={16} />
                </button>
              )}
            </Card>
          ))}
          {gefilterd.length === 0 && (
            <div className="text-center text-ink-subtle text-sm py-16">Geen meldingen</div>
          )}
        </div>
      )}
    </div>
  )
}
