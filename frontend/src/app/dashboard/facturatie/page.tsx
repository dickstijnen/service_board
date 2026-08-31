'use client'
import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, FilterPills, TableShell, LeegRij, Laden, Card, NieuwKnop, StatusBadge } from '@/components/dashboard/ui'
import { FactuurModal, type FactuurRecord } from '@/components/dashboard/FactuurModal'
import { factuurStatusKleur, euro, datum, klantNaam } from '@/lib/format'
import { FileText, Download, FileSpreadsheet, AlertCircle } from 'lucide-react'

interface Factuur extends FactuurRecord {
  id: number
  documentId: string
  klant?: { id: number; bedrijfsnaam?: string; voornaam?: string; achternaam?: string }
}

interface Optie { id: number; label: string }

interface TeFactureren {
  id: number
  opdracht_nummer: number
  type: string
  klant?: { bedrijfsnaam?: string; voornaam?: string; achternaam?: string }
  container?: { container_code?: string }
}

const STRAPI = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337'

async function downloadMetToken(path: string, bestandsnaam: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('containeros_token') : null
  const res = await fetch(`${STRAPI}/api/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) { alert('Download mislukt'); return }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = bestandsnaam
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function FacturatiePage() {
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [teFactureren, setTeFactureren] = useState<TeFactureren[]>([])
  const [klanten, setKlanten] = useState<Optie[]>([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<FactuurRecord | null>(null)

  const laad = (stil = false) => {
    if (!stil) setLaden(true)
    Promise.all([
      apiGet<{ data: Factuur[] }>('facturen?populate=*&sort=factuurdatum:desc&pagination[limit]=200'),
      apiGet<TeFactureren[]>('facturatie/te-factureren'),
    ])
      .then(([f, t]) => {
        setFacturen(f.data ?? [])
        setTeFactureren(Array.isArray(t) ? t : [])
      })
      .catch(console.error)
      .finally(() => setLaden(false))
  }

  useEffect(() => {
    laad()
    apiGet<{ data: any[] }>('klanten?pagination[limit]=200&sort=bedrijfsnaam:asc')
      .then(r => setKlanten((r.data ?? []).map(k => ({ id: k.id, label: klantNaam(k) }))))
      .catch(console.error)
  }, [])

  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const openNieuw = () => { setBewerken(null); setModalOpen(true) }
  const openBewerk = (f: Factuur) => { setBewerken(f); setModalOpen(true) }

  const gefilterd = filter ? facturen.filter(f => f.status === filter) : facturen
  const openstaand = facturen
    .filter(f => f.status === 'verzonden' || f.status === 'verlopen')
    .reduce((s, f) => s + (f.totaal ?? 0), 0)

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Facturatie"
        sub={`${facturen.length} facturen · ${euro(openstaand)} openstaand`}
        actie={
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadMetToken('facturatie/snelstart-export', 'snelstart-export.csv')}
              className="text-xs text-ink hover:bg-fill flex items-center gap-1.5 min-h-10 px-4 py-2 rounded-lg bg-fill transition-colors"
            >
              <FileSpreadsheet size={14} /> SnelStart export
            </button>
            <NieuwKnop label="Nieuwe factuur" onClick={openNieuw} />
          </div>
        }
      />

      {laden ? <Laden /> : (
        <div className="space-y-8">
          {teFactureren.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 text-amber-600">
                <AlertCircle size={15} />
                <h2 className="text-sm font-semibold">Te factureren ({teFactureren.length})</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {teFactureren.map(o => (
                  <Card key={o.id} className="p-4 border-amber-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-ink">#{o.opdracht_nummer}</span>
                      <span className="text-xs text-ink-subtle capitalize">{o.type}</span>
                    </div>
                    <div className="text-sm text-ink-muted">{klantNaam(o.klant)}</div>
                    <div className="text-xs text-ink-subtle mt-0.5">{o.container?.container_code ?? '—'}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <FilterPills
              actief={filter}
              onKies={setFilter}
              opties={[
                { value: '', label: 'Alles' },
                { value: 'concept', label: 'Concept' },
                { value: 'verzonden', label: 'Verzonden' },
                { value: 'betaald', label: 'Betaald' },
                { value: 'verlopen', label: 'Verlopen' },
              ]}
            />
            <TableShell kolommen={['Nummer', 'Klant', 'Datum', 'Vervaldatum', 'Totaal', 'Status', '']}>
              {gefilterd.map(f => (
                <tr key={f.id} onClick={() => openBewerk(f)} className="border-b border-line hover:bg-fill transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-ink-subtle" />
                      <span className="text-sm font-mono text-ink">{f.factuur_nummer ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{klantNaam(f.klant)}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">{datum(f.factuurdatum)}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">{datum(f.vervaldatum)}</td>
                  <td className="px-4 py-3 text-sm text-ink font-medium whitespace-nowrap">{euro(f.totaal)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status ?? '—'} kleur={factuurStatusKleur} vol />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadMetToken(`facturen/${f.id}/pdf`, `${f.factuur_nummer ?? 'factuur'}.pdf`) }}
                      className="text-xs text-ink-subtle hover:text-accent transition-colors inline-flex items-center gap-1"
                    >
                      <Download size={13} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
              {gefilterd.length === 0 && <LeegRij kolommen={7} tekst="Geen facturen gevonden" />}
            </TableShell>
          </div>
        </div>
      )}

      <FactuurModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={laad} factuur={bewerken} klanten={klanten} />
    </div>
  )
}
