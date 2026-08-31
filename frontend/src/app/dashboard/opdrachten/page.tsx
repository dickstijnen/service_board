'use client'
import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, FilterPills, FilterRij, StatusBadge, TableShell, LeegRij, Laden, NieuwKnop } from '@/components/dashboard/ui'
import { OpdrachtModal, type OpdrachtRecord, type ContainerOptie } from '@/components/dashboard/OpdrachtModal'
import { opdrachtStatusKleur, opdrachtTypeKleur, datumKort, klantNaam, cap , formaatLabel } from '@/lib/format'
import { ClipboardList, Pencil, ArrowDownUp, ArrowUpNarrowWide, ArrowDownWideNarrow, ListFilter, X } from 'lucide-react'

interface Opdracht extends OpdrachtRecord {
  id: number
  opdracht_nummer: number
}

interface Optie { id: number; label: string }

export default function OpdrachtenPage() {
  const [items, setItems] = useState<Opdracht[]>([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('')

  const [klanten, setKlanten] = useState<Optie[]>([])
  const [containers, setContainers] = useState<ContainerOptie[]>([])
  const [chauffeurs, setChauffeurs] = useState<Optie[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<OpdrachtRecord | null>(null)
  const [sort, setSort] = useState<'' | 'nr-asc' | 'nr-desc' | 'gepland-asc' | 'gepland-desc'>('')
  const [containerFilter, setContainerFilter] = useState<number | ''>('')
  const [containerMenu, setContainerMenu] = useState<{ x: number; y: number } | null>(null)
  const [klantFilter, setKlantFilter] = useState<number | ''>('')
  const [klantMenu, setKlantMenu] = useState<{ x: number; y: number } | null>(null)
  const [chauffeurFilter, setChauffeurFilter] = useState<number | ''>('')

  // Diep-link: ?container=<id> / ?klant=<id> / ?chauffeur=<id>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('container')
    if (c) setContainerFilter(Number(c))
    const k = params.get('klant')
    if (k) setKlantFilter(Number(k))
    const ch = params.get('chauffeur')
    if (ch) setChauffeurFilter(Number(ch))
  }, [])

  const laadOpdrachten = (stil = false) => {
    if (!stil) setLaden(true)
    apiGet<{ data: Opdracht[] }>('opdrachten?populate=*&sort=datum_gepland:desc&pagination[limit]=200')
      .then(r => setItems(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }

  useEffect(() => {
    laadOpdrachten()
    apiGet<{ data: any[] }>('klanten?pagination[limit]=200&sort=bedrijfsnaam:asc')
      .then(r => setKlanten((r.data ?? []).map(k => ({ id: k.id, label: klantNaam(k) }))))
      .catch(console.error)
    apiGet<{ data: any[] }>('containers?pagination[limit]=200&sort=container_code:asc')
      .then(r => setContainers((r.data ?? []).map(c => ({
        id: c.id,
        code: c.container_code,
        formaat: c.formaat,
        status: c.status,
        gesloten: !!c.gesloten,
        label: `${c.container_code} (${formaatLabel(c.formaat)})`,
      }))))
      .catch(console.error)
    apiGet<any[]>('users?filters[rol][$eq]=chauffeur&pagination[limit]=100')
      .then(u => setChauffeurs((Array.isArray(u) ? u : []).map(x => ({ id: x.id, label: x.name ?? x.username }))))
      .catch(console.error)
  }, [])

  useLiveRefetch(laadOpdrachten)
  const scope = useReveal(laden ? 'laden' : 'klaar')

  const openNieuw = () => { setBewerken(null); setModalOpen(true) }
  const openBewerk = (o: Opdracht) => { setBewerken(o); setModalOpen(true) }

  // Klik op een kolomkop: aflopend → oplopend → uit.
  const cycleSort = (veld: 'nr' | 'gepland') =>
    setSort(s => (s === `${veld}-desc` ? `${veld}-asc` : s === `${veld}-asc` ? '' : `${veld}-desc`))

  // Sorteerbare kolomkop: label links, sorteer-icoon rechts (space-between).
  const SortKop = (label: string, veld: 'nr' | 'gepland') => {
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

  const sorteerWaarde = (o: Opdracht, veld: 'nr' | 'gepland') =>
    veld === 'nr' ? (o.opdracht_nummer ?? 0) : (o.datum_gepland ? Date.parse(o.datum_gepland) : 0)

  // Kolomkop "Container": klik opent een dropdown met alle bakken om op te filteren.
  const ContainerKop = () => (
    <button
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setContainerMenu(m => (m ? null : { x: r.left, y: r.bottom + 4 })) }}
      title="Filter op container"
      className={`flex w-full items-center justify-between gap-1 text-xs tracking-wide transition-colors ${containerFilter ? 'text-accent' : 'text-ink-subtle hover:text-ink'}`}
    >
      Container
      <ListFilter size={13} className="flex-shrink-0" />
    </button>
  )

  // Kolomkop "Klant": klik opent een dropdown met alle klanten om op te filteren.
  const KlantKop = () => (
    <button
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setKlantMenu(m => (m ? null : { x: r.left, y: r.bottom + 4 })) }}
      title="Filter op klant"
      className={`flex w-full items-center justify-between gap-1 text-xs tracking-wide transition-colors ${klantFilter ? 'text-accent' : 'text-ink-subtle hover:text-ink'}`}
    >
      Klant
      <ListFilter size={13} className="flex-shrink-0" />
    </button>
  )

  let gefilterd = filter ? items.filter(o => o.status === filter) : items
  if (containerFilter) gefilterd = gefilterd.filter(o => (o.container as any)?.id === containerFilter)
  if (klantFilter) gefilterd = gefilterd.filter(o => (o.klant as any)?.id === klantFilter)
  if (chauffeurFilter) gefilterd = gefilterd.filter(o => (o.chauffeur as any)?.id === chauffeurFilter)
  if (sort) {
    const [veld, richting] = sort.split('-') as ['nr' | 'gepland', 'asc' | 'desc']
    gefilterd = [...gefilterd].sort((a, b) => {
      const va = sorteerWaarde(a, veld), vb = sorteerWaarde(b, veld)
      return richting === 'asc' ? va - vb : vb - va
    })
  }

  const chauffeurNaam = chauffeurFilter
    ? ((items.find(o => (o.chauffeur as any)?.id === chauffeurFilter)?.chauffeur as any)?.name
      ?? (items.find(o => (o.chauffeur as any)?.id === chauffeurFilter)?.chauffeur as any)?.username
      ?? `#${chauffeurFilter}`)
    : ''

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        titel="Opdrachten"
        sub={`${items.length} opdrachten totaal`}
        actie={<NieuwKnop label="Nieuwe opdracht" onClick={openNieuw} />}
      />

      <FilterRij>
        <FilterPills
        actief={filter}
        onKies={setFilter}
        opties={[
          { value: '', label: 'Alles' },
          { value: 'gepland', label: 'Gepland' },
          { value: 'onderweg', label: 'Onderweg' },
          { value: 'geplaatst', label: 'Geplaatst' },
          { value: 'opgehaald', label: 'Opgehaald' },
          { value: 'gewisseld', label: 'Gewisseld' },
          { value: 'geannuleerd', label: 'Geannuleerd' },
        ]}
        />
      </FilterRij>

      {chauffeurFilter && (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="text-ink-subtle">Gefilterd op chauffeur:</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 font-medium text-accent">
            {chauffeurNaam}
            <button onClick={() => setChauffeurFilter('')} aria-label="Chauffeurfilter wissen" className="hover:text-ink"><X size={13} /></button>
          </span>
        </div>
      )}

      {laden ? <Laden /> : (
        <TableShell kolommen={[
          SortKop('Nr', 'nr'),
          'Type', <KlantKop key="klant" />, <ContainerKop key="container" />, 'Adres',
          SortKop('Gepland', 'gepland'),
          'Afval', 'Status', '',
        ]}>
          {gefilterd.map(o => (
            <tr key={o.id} onClick={() => openBewerk(o)} className="border-b border-line hover:bg-fill transition-colors cursor-pointer">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={14} className="text-ink-subtle" />
                  <span className="text-sm font-mono text-ink">#{o.opdracht_nummer}</span>
                </div>
              </td>
              <td className="px-4 py-3"><StatusBadge status={o.type ?? ''} kleur={opdrachtTypeKleur} vol /></td>
              <td className="px-4 py-3 text-sm text-ink-muted">{klantNaam(o.klant as any)}</td>
              <td className="px-4 py-3 text-sm font-mono text-ink-muted">{(o.container as any)?.container_code ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-ink-subtle max-w-[200px] truncate">
                {[o.adres, o.plaatsnaam].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">{datumKort(o.datum_gepland)}</td>
              <td className="px-4 py-3 text-sm text-ink-subtle">{cap(o.afval_soort)}</td>
              <td className="px-4 py-3"><StatusBadge status={o.status ?? ''} kleur={opdrachtStatusKleur} vol /></td>
              <td className="px-4 py-3 text-right">
                <span className="text-ink-subtle hover:text-accent inline-flex items-center gap-1 text-xs"><Pencil size={13} /></span>
              </td>
            </tr>
          ))}
          {gefilterd.length === 0 && <LeegRij kolommen={9} tekst="Geen opdrachten gevonden" />}
        </TableShell>
      )}

      <OpdrachtModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={laadOpdrachten}
        opdracht={bewerken}
        klanten={klanten}
        containers={containers}
        chauffeurs={chauffeurs}
        onKlantToegevoegd={k => setKlanten(prev => [...prev, k])}
      />

      {containerMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContainerMenu(null)} />
          <div style={{ left: containerMenu.x, top: containerMenu.y }} className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-app p-1 shadow-2xl">
            <button
              onClick={() => { setContainerFilter(''); setContainerMenu(null) }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-fill ${containerFilter ? 'text-ink' : 'text-accent'}`}
            >
              Alle containers
            </button>
            {containers.map(c => (
              <button
                key={c.id}
                onClick={() => { setContainerFilter(c.id); setContainerMenu(null) }}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-fill ${containerFilter === c.id ? 'font-semibold text-accent' : 'text-ink-muted'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      {klantMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setKlantMenu(null)} />
          <div style={{ left: klantMenu.x, top: klantMenu.y }} className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-app p-1 shadow-2xl">
            <button
              onClick={() => { setKlantFilter(''); setKlantMenu(null) }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-fill ${klantFilter ? 'text-ink' : 'text-accent'}`}
            >
              Alle klanten
            </button>
            {klanten.map(k => (
              <button
                key={k.id}
                onClick={() => { setKlantFilter(k.id); setKlantMenu(null) }}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-fill ${klantFilter === k.id ? 'font-semibold text-accent' : 'text-ink-muted'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
