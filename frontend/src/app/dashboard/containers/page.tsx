'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, FilterPills, FilterRij, StatusBadge, TableShell, LeegRij, Laden, NieuwKnop, BADGE } from '@/components/dashboard/ui'
import { ContainerModal, type ContainerRecord } from '@/components/dashboard/ContainerModal'
import { containerStatusKleur , containerStatusLabel, formaatLabel, bakPin } from '@/lib/format'
import { Pencil, ArrowDownUp, ArrowUpNarrowWide, ArrowDownWideNarrow, ClipboardList } from 'lucide-react'

// Numerieke grootte uit de formaat-code voor het sorteren; niet-numerieke
// formaten (portaal, haak, zeecontainer, …) belanden achteraan.
function maatWaarde(formaat?: string): number {
  const n = Number((formaat ?? '').match(/(\d+)\s*m3/i)?.[1])
  return Number.isFinite(n) ? n : 9999
}

interface Container extends ContainerRecord {
  id: number
  container_code: string
  formaat: string
  status: string
}

export default function ContainersPage() {
  const router = useRouter()
  const [containers, setContainers] = useState<Container[]>([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<ContainerRecord | null>(null)
  const [sort, setSort] = useState<'' | 'id-asc' | 'id-desc' | 'maat-asc' | 'maat-desc'>('')

  const laad = (stil = false) => {
    if (!stil) setLaden(true)
    apiGet<{ data: Container[] }>('containers?populate=*&pagination[limit]=200')
      .then(r => setContainers(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }

  useEffect(laad, [])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const openNieuw = () => { setBewerken(null); setModalOpen(true) }
  const openBewerk = (c: Container) => { setBewerken(c); setModalOpen(true) }

  // Sorteerbare kolomkop: label links, sorteer-icoon rechts (space-between).
  const SortKop = (label: string, veld: 'id' | 'maat') => {
    const Icoon = sort === `${veld}-asc` ? ArrowUpNarrowWide : sort === `${veld}-desc` ? ArrowDownWideNarrow : ArrowDownUp
    return (
      <button
        onClick={() => cycleSort(veld)}
        title="Sorteren"
        className={`flex w-full items-center justify-between gap-1 text-xs tracking-wide transition-colors ${sort.startsWith(veld) ? 'text-accent' : 'text-ink-subtle hover:text-ink'}`}
      >
        {label}
        <Icoon size={13} className="flex-shrink-0" />
      </button>
    )
  }

  // Klik op een kolomkop: aflopend → oplopend → uit.
  const cycleSort = (veld: 'id' | 'maat') =>
    setSort(s => (s === `${veld}-desc` ? `${veld}-asc` : s === `${veld}-asc` ? '' : `${veld}-desc`))

  let gefilterd = filter ? containers.filter(c => c.status === filter) : containers
  if (sort) {
    const [veld, richting] = sort.split('-') as ['id' | 'maat', 'asc' | 'desc']
    gefilterd = [...gefilterd].sort((a, b) => {
      const va = veld === 'id' ? a.id : maatWaarde(a.formaat)
      const vb = veld === 'id' ? b.id : maatWaarde(b.formaat)
      return richting === 'asc' ? va - vb : vb - va
    })
  }

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Containers"
        sub={`${containers.length} containers totaal`}
        actie={<NieuwKnop label="Nieuwe container" onClick={openNieuw} />}
      />

      <FilterRij>
        <FilterPills
        actief={filter}
        onKies={setFilter}
        opties={[
          { value: '', label: 'Alles' },
          { value: 'beschikbaar', label: 'Beschikbaar' },
          { value: 'geplaatst', label: 'Geplaatst' },
          { value: 'onderweg', label: 'Onderweg' },
          { value: 'onderhoud', label: 'Onderhoud' },
        ]}
        />
      </FilterRij>

      {laden ? <Laden /> : (
        <TableShell kolommen={[
          SortKop('Code', 'id'),
          SortKop('Formaat', 'maat'),
          'Status', 'Locatie', 'Opdrachten', '',
        ]}>
          {gefilterd.map(c => (
            <tr key={c.id} onClick={() => openBewerk(c)} className="border-b border-line hover:bg-fill transition-colors cursor-pointer">
              <td className="px-4 py-3">
                <span className="text-sm font-mono text-ink">{c.container_code}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <img src={bakPin(c.formaat)} alt="" className="h-6 w-[65px] object-contain object-left flex-shrink-0" />
                  <span className="text-sm text-ink-muted">{formaatLabel(c.formaat)}</span>
                  {c.gesloten && <span className={`${BADGE} bg-fill text-ink-muted`}>Gesloten</span>}
                </div>
              </td>
              <td className="px-4 py-3"><StatusBadge status={c.status} kleur={containerStatusKleur} vol labels={containerStatusLabel} /></td>
              <td className="px-4 py-3 text-sm text-ink-subtle max-w-xs truncate">{c.huidige_locatie_adres ?? '—'}</td>
              <td className="px-4 py-3">
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/dashboard/opdrachten?container=${c.id}`) }}
                  title="Alle opdrachten van deze container"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <ClipboardList size={13} /> Opdrachten
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-ink-subtle inline-flex items-center text-xs"><Pencil size={13} /></span>
              </td>
            </tr>
          ))}
          {gefilterd.length === 0 && <LeegRij kolommen={6} tekst="Geen containers gevonden" />}
        </TableShell>
      )}

      <ContainerModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={laad} container={bewerken} />
    </div>
  )
}
