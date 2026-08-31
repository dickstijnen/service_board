'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, FilterPills, FilterRij, ZoekVeld, TableShell, LeegRij, Laden, NieuwKnop } from '@/components/dashboard/ui'
import { KlantModal, type KlantRecord } from '@/components/dashboard/KlantModal'
import { klantNaam } from '@/lib/format'
import { Building2, User, Phone, Mail, Pencil, ArrowDownUp, ArrowUpNarrowWide, ArrowDownWideNarrow, ClipboardList } from 'lucide-react'

interface Klant extends KlantRecord {
  id: number
  opdrachten?: { id: number }[]
}

export default function KlantenPage() {
  const router = useRouter()
  const [items, setItems] = useState<Klant[]>([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('')
  const [zoek, setZoek] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<KlantRecord | null>(null)
  const [sort, setSort] = useState<'' | 'naam-asc' | 'naam-desc' | 'aantal-asc' | 'aantal-desc'>('')

  const laad = (stil = false) => {
    if (!stil) setLaden(true)
    // Nieuwste bovenaan, en particulier/zakelijk door elkaar (op aanmaakdatum
    // i.p.v. bedrijfsnaam, want dat clusterde de particulieren apart).
    apiGet<{ data: Klant[] }>('klanten?populate=*&sort=createdAt:desc&pagination[limit]=200')
      .then(r => setItems(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }

  useEffect(laad, [])
  useLiveRefetch(laad)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const openNieuw = () => { setBewerken(null); setModalOpen(true) }
  const openBewerk = (k: Klant) => { setBewerken(k); setModalOpen(true) }

  // Klik op een kolomkop: aflopend → oplopend → uit.
  const cycleSort = (veld: 'naam' | 'aantal') =>
    setSort(s => (s === `${veld}-desc` ? `${veld}-asc` : s === `${veld}-asc` ? '' : `${veld}-desc`))

  // Sorteerbare kolomkop: label links, sorteer-icoon rechts (space-between).
  const SortKop = (label: string, veld: 'naam' | 'aantal') => {
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

  let gefilterd = items
    .filter(k => filter === '' || (filter === 'bedrijf' ? !!k.bedrijfsnaam : !k.bedrijfsnaam))
    .filter(k => {
      if (!zoek) return true
      const q = zoek.toLowerCase()
      return [klantNaam(k), k.email, k.telefoon, k.plaatsnaam].some(v => v?.toLowerCase().includes(q))
    })
  if (sort) {
    const [veld, richting] = sort.split('-') as ['naam' | 'aantal', 'asc' | 'desc']
    gefilterd = [...gefilterd].sort((a, b) => {
      const d = veld === 'naam'
        ? klantNaam(a).localeCompare(klantNaam(b), 'nl')
        : (a.opdrachten?.length ?? 0) - (b.opdrachten?.length ?? 0)
      return richting === 'asc' ? d : -d
    })
  }

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Klanten"
        sub={`${items.length} klanten totaal`}
        actie={<NieuwKnop label="Nieuwe klant" onClick={openNieuw} />}
      />

      <FilterRij>
        <FilterPills
          actief={filter}
          onKies={setFilter}
          opties={[
            { value: '', label: 'Alles' },
            { value: 'bedrijf', label: 'Bedrijven' },
            { value: 'particulier', label: 'Particulier' },
          ]}
        />
        <ZoekVeld waarde={zoek} onWijzig={setZoek} placeholder="Zoek klant..." />
      </FilterRij>

      {laden ? <Laden /> : (
        <TableShell kolommen={[
          SortKop('Klant', 'naam'),
          'Contact', 'Plaats', 'KvK',
          SortKop('Opdrachten', 'aantal'),
          '',
        ]}>
          {gefilterd.map(k => (
            <tr key={k.id} onClick={() => openBewerk(k)} className="border-b border-line hover:bg-fill transition-colors cursor-pointer">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {k.bedrijfsnaam
                    ? <Building2 size={14} className="text-ink-subtle" />
                    : <User size={14} className="text-ink-subtle" />}
                  <span className="text-sm text-ink">{klantNaam(k)}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  {k.email && <span className="text-xs text-ink-muted flex items-center gap-1.5"><Mail size={11} />{k.email}</span>}
                  {k.telefoon && <span className="text-xs text-ink-subtle flex items-center gap-1.5"><Phone size={11} />{k.telefoon}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-ink-muted">{k.plaatsnaam ?? '—'}</td>
              <td className="px-4 py-3 text-sm font-mono text-ink-subtle">{k.kvk_nummer ?? '—'}</td>
              <td className="px-4 py-3">
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/dashboard/opdrachten?klant=${k.id}`) }}
                  title="Alle opdrachten van deze klant"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <ClipboardList size={13} /> Opdrachten ({k.opdrachten?.length ?? 0})
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-ink-subtle hover:text-accent inline-flex items-center text-xs"><Pencil size={13} /></span>
              </td>
            </tr>
          ))}
          {gefilterd.length === 0 && <LeegRij kolommen={6} tekst="Geen klanten gevonden" />}
        </TableShell>
      )}

      <KlantModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => laad(true)} klant={bewerken} />
    </div>
  )
}
