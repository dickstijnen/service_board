'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, Laden, Card } from '@/components/dashboard/ui'
import { euro, cap , formaatLabel } from '@/lib/format'
import { User, Mail, Shield, Table2, LogOut } from 'lucide-react'

interface Tarief {
  id: number
  documentId?: string
  formaat?: string
  afval_soort?: string
  prijs?: number
}

const FORMATEN = ['c1m3', 'c3m3', 'c6m3', 'c9m3', 'c9m3-g', 'c20m3', 'c40m3']
const AFVAL = ['puin', 'afval', 'hout', 'grond', 'groen']

export default function InstellingenPage() {
  const { gebruiker, logout } = useAuth()
  const router = useRouter()
  const isChauffeur = gebruiker?.rol === 'chauffeur'
  const isAdmin = gebruiker?.rol === 'admin'
  const uitloggen = () => { logout(); router.push('/login') }
  const [tarieven, setTarieven] = useState<Tarief[]>([])
  const [laden, setLaden] = useState(true)

  const laad = useCallback(() => {
    if (isChauffeur) {
      setLaden(false)
      return
    }

    apiGet<{ data: Tarief[] }>('tarieven?pagination[limit]=200')
      .then(r => setTarieven(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }, [isChauffeur])

  useEffect(() => {
    const id = window.setTimeout(laad, 0)
    return () => window.clearTimeout(id)
  }, [laad])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const byCell = useMemo(() => {
    const m = new Map<string, Tarief>()
    tarieven.forEach(t => { if (t.formaat && t.afval_soort) m.set(`${t.formaat}|${t.afval_soort}`, t) })
    return m
  }, [tarieven])

  // Admin bewerkt een cel → direct opslaan in Strapi (nieuw, wijzigen of leegmaken).
  const zetPrijs = async (formaat: string, afval: string, raw: string, bestaand?: Tarief) => {
    const waarde = raw.trim() === '' ? null : Number(raw)
    if (waarde != null && !Number.isFinite(waarde)) return
    if ((bestaand?.prijs ?? null) === waarde) return
    try {
      if (bestaand?.documentId) {
        if (waarde == null) await apiDelete(`tarieven/${bestaand.documentId}`)
        else await apiPut(`tarieven/${bestaand.documentId}`, { data: { prijs: waarde } })
      } else if (waarde != null) {
        await apiPost('tarieven', { data: { formaat, afval_soort: afval, prijs: waarde } })
      }
      laad()
    } catch (e) {
      console.error(e)
      alert('Tarief opslaan mislukt')
    }
  }

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader titel="Instellingen" sub={isChauffeur ? 'Profiel' : 'Profiel en tarieven'} />

      <div className="space-y-8 max-w-4xl">
        {/* Profiel */}
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Mijn profiel</h2>
          <Card className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-ink-subtle"><User size={16} /></div>
                <div>
                  <div className="text-xs text-ink-subtle">Gebruiker</div>
                  <div className="text-sm text-ink">{gebruiker?.name ?? gebruiker?.username ?? '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-ink-subtle"><Mail size={16} /></div>
                <div>
                  <div className="text-xs text-ink-subtle">E-mail</div>
                  <div className="text-sm text-ink">{gebruiker?.email ?? '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-ink-subtle"><Shield size={16} /></div>
                <div>
                  <div className="text-xs text-ink-subtle">Rol</div>
                  <div className="text-sm text-ink capitalize">{gebruiker?.rol ?? '—'}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <button
                onClick={uitloggen}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-danger px-4 text-xs font-medium text-white transition-colors hover:bg-danger/90"
              >
                <LogOut size={14} /> Uitloggen
              </button>
            </div>
          </Card>
        </div>

        {!isChauffeur && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Table2 size={15} className="text-ink-subtle" />
              <h2 className="text-sm font-semibold text-ink">Tarievenmatrix</h2>
              <span className="text-xs text-ink-subtle">{tarieven.length} tarieven</span>
            </div>
            {laden ? <Laden /> : (
              <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-4 py-3 text-left text-xs text-ink-subtle tracking-wide">Formaat</th>
                      {AFVAL.map(a => (
                        <th key={a} className="px-4 py-3 text-right text-xs text-ink-subtle tracking-wide">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FORMATEN.map(f => (
                      <tr key={f} className="border-b border-line hover:bg-fill transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-ink">{formaatLabel(f)}</td>
                        {AFVAL.map(a => {
                          const t = byCell.get(`${f}|${a}`)
                          const p = t?.prijs
                          if (!isAdmin) {
                            return (
                              <td key={a} className="px-4 py-3 text-right text-sm text-ink-muted">
                                {p != null ? euro(p) : <span className="text-ink-subtle">—</span>}
                              </td>
                            )
                          }
                          return (
                            <td key={a} className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-xs text-ink-subtle">€</span>
                                <input
                                  key={`${f}|${a}|${p ?? ''}`}
                                  type="number" step="0.01" min="0"
                                  defaultValue={p ?? ''}
                                  onBlur={e => zetPrijs(f, a, e.target.value, t)}
                                  placeholder="—"
                                  className="w-20 min-h-9 rounded-md border border-line bg-surface px-2 text-right text-sm text-ink outline-none focus:border-accent"
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-ink-subtle mt-3">
              {isAdmin
                ? 'Pas een bedrag aan en klik ernaast (of tab) om het direct in Strapi op te slaan. Leegmaken verwijdert het tarief.'
                : `Tarieven worden beheerd door een ${cap('admin')} of in Strapi (→ Tarief).`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
