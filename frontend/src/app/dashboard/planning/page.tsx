'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useLiveRefetch } from '@/hooks/useLiveRefetch'
import { useReveal } from '@/hooks/useReveal'
import { OpdrachtModal, type OpdrachtRecord, type ContainerOptie } from '@/components/dashboard/OpdrachtModal'
import { NieuwKnop, StatusBadge, BADGE } from '@/components/dashboard/ui'
import { selectChevron, selectRuimte } from '@/components/dashboard/fields'
import { klantNaam, opdrachtStatusKleur , formaatLabel } from '@/lib/format'
import { ChevronLeft, ChevronRight, Calendar, Clock, AlertTriangle, Users, Truck, Plus, Ban, GripVertical } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
interface Opdracht extends OpdrachtRecord {
  id: number
  documentId: string
  opdracht_nummer?: number
  datum_plaatsing?: string
  klant?: { id: number; bedrijfsnaam?: string; voornaam?: string; achternaam?: string }
  container?: { id: number; container_code?: string; formaat?: string }
  chauffeur?: { id: number; username?: string; name?: string }
}
interface Gebruiker { id: number; username: string; name?: string; blocked?: boolean }
interface Beschikbaarheid { id: number; documentId: string; datum?: string; dagdeel?: string; status?: string; chauffeur?: { id: number } }
interface Optie { id: number; label: string }
type Tab = 'kalender' | 'openstaand' | 'te-laat' | 'chauffeurs'
type DagdeelKey = 'ochtend' | 'middag' | 'avond'

// ── Helpers ────────────────────────────────────────────────────────
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dStr(val?: string | null) {
  if (!val) return ''
  return val.includes('T') || val.includes('Z') ? fmt(new Date(val)) : val.slice(0, 10)
}
function weekMaandag(d: Date) {
  const day = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return fmt(mon)
}
function dagenSinds(iso?: string) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(dStr(iso) + 'T00:00:00').getTime()) / 86400000)
}
function dagdeelVan(o: Opdracht): DagdeelKey {
  const t = o.voorkeur_tijdstip ?? 'ochtend'
  if (t.includes('middag')) return 'middag'
  if (t.includes('avond')) return 'avond'
  return 'ochtend'
}

const DAG_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
const DAGDELEN: { key: DagdeelKey; kort: string; label: string }[] = [
  { key: 'ochtend', kort: 'O', label: 'Ochtend' },
  { key: 'middag', kort: 'M', label: 'Middag' },
  { key: 'avond', kort: 'A', label: 'Avond' },
]
// Diagonale arcering voor uitgegrijsde dagen (zondagen + verleden) in de
// maandkalender. Donkere lijntjes — op het lichte thema is wit onzichtbaar.
const ARCERING =
  'repeating-linear-gradient(45deg, rgba(26,29,33,0.06) 0px, rgba(26,29,33,0.06) 1px, transparent 1px, transparent 7px)'

const typeDot: Record<string, string> = { plaatsing: 'bg-accent', ophaling: 'bg-blue-500', wisseling: 'bg-purple-500' }
const typeText: Record<string, string> = { plaatsing: 'text-accent', ophaling: 'text-blue-600', wisseling: 'text-purple-600' }
const typeBg: Record<string, string> = { plaatsing: 'bg-accent', ophaling: 'bg-blue-500', wisseling: 'bg-purple-500' }

// ── Opdrachtkaartje (sleepbaar) ────────────────────────────────────
function OrderChip({ o, onClick, onDragStart, onDragEnd, dragging }: {
  o: Opdracht; onClick: () => void
  onDragStart: () => void; onDragEnd: () => void; dragging: boolean
}) {
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`flex min-h-10 flex-col justify-center rounded-lg px-2 py-1.5 text-white text-[10px] leading-tight select-none cursor-pointer mt-1 transition
        ${typeBg[o.type ?? ''] ?? 'bg-fill'} ${dragging ? 'opacity-30' : 'hover:brightness-110'}`}
    >
      <div className="min-w-0 max-w-full font-semibold truncate">{klantNaam(o.klant)}</div>
      {o.container?.container_code && <div className="min-w-0 max-w-full opacity-70 text-[9px] truncate">{o.container.container_code}</div>}
    </div>
  )
}

// ── Rit-regel (mobiele weekweergave) ──────────────────────────────
/**
 * Zelfde kaartje als OrderChip, maar als volle regel met dagdeel ervoor. Het
 * greepje links is de sleephandgreep: alleen dáár staat touch-action uit, zodat
 * je met je duim over de rest van de kaart nog gewoon kunt scrollen.
 */
function RitRegel({ o, onClick, sleepend, grip }: {
  o: Opdracht
  onClick: () => void
  sleepend: boolean
  grip: React.DOMAttributes<HTMLSpanElement>
}) {
  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded-lg pr-2 text-[11px] leading-tight text-white transition
        ${typeBg[o.type ?? ''] ?? 'bg-fill'} ${sleepend ? 'opacity-30' : ''}`}
    >
      <span
        {...grip}
        role="button"
        aria-label={`${klantNaam(o.klant)} verplaatsen`}
        className="flex min-h-10 w-7 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded-l-lg bg-black/20 text-white/80 active:bg-black/30"
      >
        <GripVertical size={14} />
      </span>
      <button onClick={onClick} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        <span className="flex-shrink-0 font-bold opacity-70">{DAGDELEN.find(d => d.key === dagdeelVan(o))?.kort}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{klantNaam(o.klant)}</span>
        {o.container?.container_code && <span className="flex-shrink-0 opacity-70">{o.container.container_code}</span>}
      </button>
    </div>
  )
}

export default function PlanningPage() {
  const { gebruiker } = useAuth()
  const isChauffeur = gebruiker?.rol === 'chauffeur'

  const vandaag = new Date()
  const vandaagStr = fmt(vandaag)

  const [tab, setTab] = useState<Tab>('kalender')
  const [jaar, setJaar] = useState(vandaag.getFullYear())
  const [maand, setMaand] = useState(vandaag.getMonth())
  const [geselecteerd, setGeselecteerd] = useState(vandaagStr)
  const [opdrachten, setOpdrachten] = useState<Opdracht[]>([])
  const [laden, setLaden] = useState(true)

  // Modal-opties (klant/container/chauffeur) + bewerken-state
  const [klanten, setKlanten] = useState<Optie[]>([])
  const [containers, setContainers] = useState<ContainerOptie[]>([])
  const [chauffeurOpties, setChauffeurOpties] = useState<Optie[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerken, setBewerken] = useState<OpdrachtRecord | null>(null)

  // Per-chauffeur week
  const [weekMa, setWeekMa] = useState(() => weekMaandag(vandaag))
  const [chauffeurs, setChauffeurs] = useState<Gebruiker[]>([])
  const [beschikbaarheid, setBeschikbaarheid] = useState<Beschikbaarheid[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dagdeelMenu, setDagdeelMenu] = useState<
    { chauffeurId: number; datum: string; dagdeel: DagdeelKey; x: number; y: number } | null
  >(null)

  // Chauffeur-filter: null = alle chauffeurs (standaard). Deeplink via ?chauffeur=<id>.
  const [chauffeurFilter, setChauffeurFilter] = useState<number | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('chauffeur')
    if (p) { setChauffeurFilter(Number(p)); setTab('chauffeurs') }
  }, [])

  // Maand-grid bereik (zondag t/m zaterdag)
  const { cellen, gridStart, gridEinde } = useMemo(() => {
    const eerste = new Date(jaar, maand, 1)
    const start = new Date(eerste)
    start.setDate(eerste.getDate() - eerste.getDay())
    const laatste = new Date(jaar, maand + 1, 0)
    const eind = new Date(laatste)
    eind.setDate(laatste.getDate() + (6 - laatste.getDay()))
    const lijst: Date[] = []
    const c = new Date(start)
    while (c <= eind) { lijst.push(new Date(c)); c.setDate(c.getDate() + 1) }
    return { cellen: lijst, gridStart: fmt(start), gridEinde: fmt(eind) }
  }, [jaar, maand])

  // Opties één keer laden (voor modal + chauffeur-grid)
  useEffect(() => {
    apiGet<{ data: any[] }>('klanten?pagination[limit]=200&sort=bedrijfsnaam:asc')
      .then(r => setKlanten((r.data ?? []).map(k => ({ id: k.id, label: klantNaam(k) })))).catch(console.error)
    apiGet<{ data: any[] }>('containers?pagination[limit]=200&sort=container_code:asc')
      .then(r => setContainers((r.data ?? []).map(c => ({
        id: c.id,
        code: c.container_code,
        formaat: c.formaat,
        status: c.status,
        gesloten: !!c.gesloten,
        label: `${c.container_code} (${formaatLabel(c.formaat)})`,
      })))).catch(console.error)
    apiGet<Gebruiker[]>('users?filters[rol][$eq]=chauffeur&pagination[limit]=100')
      .then(u => {
        const arr = Array.isArray(u) ? u : []
        setChauffeurs(arr)
        setChauffeurOpties(arr.map(x => ({ id: x.id, label: x.name ?? x.username })))
      }).catch(console.error)
  }, [])

  const weekDagen = useMemo(() => {
    const ma = new Date(weekMa + 'T12:00:00')
    return Array.from({ length: 6 }, (_, i) => { const d = new Date(ma); d.setDate(ma.getDate() + i); return fmt(d) })
  }, [weekMa])

  // Tab-gedreven laden — elke weergave haalt precies de data op die ze nodig heeft.
  const laad = (stil = false) => {
    if (!stil) setLaden(true)
    let url: string
    if (tab === 'chauffeurs') {
      // Deze week ($or[0]) plus alle ongeplande opdrachten ($or[1], datum leeg)
      // — die laatste vormen de backlog onderaan de planning.
      url = `opdrachten?populate=*&pagination[limit]=300&filters[$or][0][datum_gepland][$gte]=${weekDagen[0]}&filters[$or][0][datum_gepland][$lte]=${weekDagen[5]}&filters[$or][1][datum_gepland][$null]=true`
      apiGet<{ data: Beschikbaarheid[] }>(`chauffeur-beschikbaarheden?populate=*&filters[datum][$gte]=${weekDagen[0]}&filters[datum][$lte]=${weekDagen[5]}&pagination[limit]=300`)
        .then(r => setBeschikbaarheid(r.data ?? [])).catch(console.error)
    } else if (tab === 'openstaand') {
      url = `opdrachten?populate=*&pagination[limit]=300&sort=datum_gepland:asc&filters[type][$eq]=plaatsing&filters[status][$eq]=gepland`
    } else if (tab === 'te-laat') {
      url = `opdrachten?populate=*&pagination[limit]=300&filters[status][$eq]=geplaatst`
    } else {
      // Deze maand ($or[0]) plus alle ongeplande opdrachten ($or[1]) — die laatste
      // vormen de backlog onder de kalender.
      url = `opdrachten?populate=*&pagination[limit]=300&sort=datum_gepland:asc&filters[$or][0][datum_gepland][$gte]=${gridStart}&filters[$or][0][datum_gepland][$lte]=${gridEinde}&filters[$or][1][datum_gepland][$null]=true`
      // Ook de niet-beschikbaarheid voor de maand laden, zodat de kalender per
      // dag een rood bolletje kan tonen als er iemand niet beschikbaar is.
      apiGet<{ data: Beschikbaarheid[] }>(`chauffeur-beschikbaarheden?populate=*&filters[datum][$gte]=${gridStart}&filters[datum][$lte]=${gridEinde}&filters[status][$eq]=niet-beschikbaar&pagination[limit]=500`)
        .then(r => setBeschikbaarheid(r.data ?? [])).catch(console.error)
    }
    apiGet<{ data: Opdracht[] }>(url)
      .then(r => setOpdrachten(r.data ?? []))
      .catch(console.error)
      .finally(() => setLaden(false))
  }
  useEffect(laad, [tab, gridStart, gridEinde, weekMa])
  useLiveRefetch(laad)
  const laadWeek = laad
  const scope = useReveal(`${tab}|${laden ? 'laden' : 'klaar'}`)

  // Maandwissel → selecteer vandaag of de 1e
  useEffect(() => {
    const huidig = vandaag.getMonth() === maand && vandaag.getFullYear() === jaar
    setGeselecteerd(huidig ? vandaagStr : fmt(new Date(jaar, maand, 1)))
  }, [jaar, maand])

  const zichtbaar = isChauffeur
    ? opdrachten.filter(o => o.chauffeur?.id === gebruiker?.id)
    : chauffeurFilter
      ? opdrachten.filter(o => o.chauffeur?.id === chauffeurFilter)
      : opdrachten
  const opDag = (datum: string) => zichtbaar.filter(o => dStr(o.datum_gepland) === datum)
  // Kolommen in het weekrooster: alle chauffeurs, of alleen de gefilterde.
  const gridChauffeurs = chauffeurFilter ? chauffeurs.filter(c => c.id === chauffeurFilter) : chauffeurs
  // Backlog: opdrachten zonder geplande datum — nog in te plannen. Sleep ze op
  // een chauffeur + dag om ze te plannen.
  const backlog = opdrachten.filter(o => !dStr(o.datum_gepland) && o.status !== 'geannuleerd')

  const openModal = (o?: Opdracht) => { setBewerken(o ?? null); setModalOpen(true) }
  // Nieuwe opdracht vanuit de kalender: datum voorgevuld met de gekozen dag.
  const openNieuwOpDag = (datum?: string) => { setBewerken(datum ? { datum_gepland: datum } : null); setModalOpen(true) }

  // ── Slepen op touch ──────────────────────────────────────────────
  // HTML5 drag-and-drop bestaat niet op mobiel, dus daar doen we het met pointer
  // events: het greepje van een rit-regel vangt de pointer, en onder je vinger
  // zoeken we met elementFromPoint de dichtstbijzijnde [data-drop]-zone.
  const [sleep, setSleep] = useState<{ id: string; x: number; y: number } | null>(null)
  const [randScroll, setRandScroll] = useState(0)

  const doelOnder = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null

  /** "12|2026-07-27|ochtend" of "null|2026-07-27" → losse waarden. */
  const ontleedDoel = (doel: string) => {
    const [c, datum, dagdeel] = doel.split('|')
    return {
      chauffeurId: c === 'null' ? null : Number(c),
      datum,
      dagdeel: (dagdeel || undefined) as DagdeelKey | undefined,
    }
  }

  // Bij de boven- en onderrand doorscrollen, anders kun je een rit niet naar een
  // andere dag slepen dan die op je scherm staat.
  const randSnelheid = (y: number) => (y < 110 ? -12 : y > window.innerHeight - 150 ? 12 : 0)
  useEffect(() => {
    if (!randScroll) return
    const el = document.querySelector('main')
    if (!el) return
    const id = window.setInterval(() => el.scrollBy({ top: randScroll }), 16)
    return () => window.clearInterval(id)
  }, [randScroll])

  const sleepGrip = (o: Opdracht): React.DOMAttributes<HTMLSpanElement> => ({
    onPointerDown: e => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragId(o.documentId)
      setSleep({ id: o.documentId, x: e.clientX, y: e.clientY })
    },
    onPointerMove: e => {
      if (!sleep) return
      setSleep(s => (s ? { ...s, x: e.clientX, y: e.clientY } : s))
      setDropTarget(doelOnder(e.clientX, e.clientY))
      setRandScroll(randSnelheid(e.clientY))
    },
    onPointerUp: e => {
      const id = sleep?.id ?? null
      const doel = sleep ? doelOnder(e.clientX, e.clientY) : null
      setSleep(null)
      setRandScroll(0)
      if (doel === 'backlog' && id) {
        handleUnplan(id)
      } else if (doel) {
        const { chauffeurId, datum, dagdeel } = ontleedDoel(doel)
        handleDrop(chauffeurId, datum, dagdeel)
      } else {
        setDragId(null)
        setDropTarget(null)
      }
    },
    onPointerCancel: () => {
      setSleep(null)
      setRandScroll(0)
      setDragId(null)
      setDropTarget(null)
    },
  })

  // Sleep → herplannen (datum + chauffeur + evt. dagdeel/voorkeur_tijdstip), persist via PUT
  const handleDrop = async (chauffeurId: number | null, datum: string, dagdeel?: DagdeelKey) => {
    setDropTarget(null)
    if (!dragId) return
    const id = dragId; setDragId(null)
    setOpdrachten(prev => prev.map(o => o.documentId === id
      ? { ...o, datum_gepland: datum, chauffeur: chauffeurId ? { id: chauffeurId } : undefined, ...(dagdeel ? { voorkeur_tijdstip: dagdeel } : {}) }
      : o))
    const data: Record<string, any> = { datum_gepland: datum, chauffeur: chauffeurId }
    if (dagdeel) data.voorkeur_tijdstip = dagdeel
    try {
      await apiPut(`opdrachten/${id}`, { data })
    } catch (e) { console.error(e); laadWeek() }
  }

  // Terug naar de backlog: datum + chauffeur + tijdstip leegmaken (ontplannen).
  const handleUnplan = async (id: string) => {
    setDropTarget(null)
    setDragId(null)
    setOpdrachten(prev => prev.map(o => o.documentId === id
      ? { ...o, datum_gepland: undefined, chauffeur: undefined, voorkeur_tijdstip: undefined }
      : o))
    try {
      await apiPut(`opdrachten/${id}`, { data: { datum_gepland: null, chauffeur: null, voorkeur_tijdstip: null } })
    } catch (e) { console.error(e); laadWeek() }
  }

  // Beschikbaarheid togglen (niet-beschikbaar)
  const besch = (cId: number, datum: string, dd: DagdeelKey) =>
    beschikbaarheid.find(b => b.chauffeur?.id === cId && dStr(b.datum) === datum && b.dagdeel === dd)
  const toggleBesch = async (cId: number, datum: string, dd: DagdeelKey) => {
    const b = besch(cId, datum, dd)
    if (b) {
      setBeschikbaarheid(p => p.filter(x => x.id !== b.id))
      apiDelete(`chauffeur-beschikbaarheden/${b.documentId}`).catch(() => laadWeek())
    } else {
      try {
        const r = await apiPost<{ data: Beschikbaarheid }>('chauffeur-beschikbaarheden', {
          data: { chauffeur: cId, datum, dagdeel: dd, status: 'niet-beschikbaar' },
        })
        const nieuw = (r as any)?.data
        if (nieuw) setBeschikbaarheid(p => [...p, { ...nieuw, chauffeur: { id: cId } }])
        else laadWeek()
      } catch (e) { console.error(e) }
    }
  }

  // Klik op een dagdeel in het weekrooster opent een keuzemenu: inplannen of
  // beschikbaarheid omzetten. Vaste positionering, anders klipt de horizontale
  // scrollcontainer van de tabel het menu weg.
  const openDagdeelMenu = (e: React.MouseEvent<HTMLButtonElement>, chauffeurId: number, datum: string, dagdeel: DagdeelKey) => {
    const r = e.currentTarget.getBoundingClientRect()
    setDagdeelMenu({
      chauffeurId, datum, dagdeel,
      x: Math.min(r.left, window.innerWidth - 216),
      y: Math.min(r.bottom + 4, window.innerHeight - 108),
    })
  }
  useEffect(() => {
    if (!dagdeelMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDagdeelMenu(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dagdeelMenu])

  const planOpCel = (chauffeurId: number, datum: string, dagdeel: DagdeelKey) => {
    setDagdeelMenu(null)
    setBewerken({ datum_gepland: datum, chauffeur: { id: chauffeurId }, voorkeur_tijdstip: dagdeel })
    setModalOpen(true)
  }

  const maandLabel = new Date(jaar, maand).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const vorigeMaand = () => maand === 0 ? (setMaand(11), setJaar(j => j - 1)) : setMaand(m => m - 1)
  const volgendeMaand = () => maand === 11 ? (setMaand(0), setJaar(j => j + 1)) : setMaand(m => m + 1)
  const verschuifWeek = (delta: number) => { const d = new Date(weekMa + 'T12:00:00'); d.setDate(d.getDate() + delta * 7); setWeekMa(fmt(d)) }

  const geselDatum = new Date(geselecteerd + 'T12:00:00')
  const dagLabel = geselDatum.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const geselOpdrachten = opDag(geselecteerd)
  // Zondag of een dag die al geweest is → uitgegrijsd; daar geen "aanmaken"-prompt.
  const geselGedimd = geselDatum.getDay() === 0 || geselecteerd < vandaagStr

  // Wie is er op de geselecteerde dag niet beschikbaar? (zelfde data als de
  // rode bolletjes in de kalender) — samengevat per chauffeur voor het dag-detail.
  const geselNietBeschikbaar = chauffeurs
    .map(c => {
      const dds = beschikbaarheid
        .filter(b => b.chauffeur?.id === c.id && dStr(b.datum) === geselecteerd && b.status === 'niet-beschikbaar')
        .map(b => b.dagdeel)
      if (!dds.length) return null
      const tekst = dds.length >= DAGDELEN.length
        ? 'hele dag'
        : DAGDELEN.filter(d => dds.includes(d.key)).map(d => d.label.toLowerCase()).join(', ')
      return { naam: c.name ?? c.username, tekst }
    })
    .filter((n): n is { naam: string; tekst: string } => n !== null)

  const tabs: { key: Tab; label: string; kort: string; icon: React.ReactNode; actief: string }[] = [
    { key: 'kalender', label: 'Kalender', kort: 'Kalender', icon: <Calendar size={13} />, actief: 'bg-accent text-white' },
    { key: 'openstaand', label: 'Wacht op plaatsing', kort: 'Openstaand', icon: <Clock size={13} />, actief: 'bg-accent text-white' },
    { key: 'te-laat', label: 'Te laat ophalen', kort: 'Te laat', icon: <AlertTriangle size={13} />, actief: 'bg-accent text-white' },
    { key: 'chauffeurs', label: 'Per chauffeur', kort: 'Agenda', icon: <Users size={13} />, actief: 'bg-accent text-white' },
  ]
  const zichtbareTabs = isChauffeur ? tabs.filter(t => t.key === 'kalender') : tabs

  const openstaand = zichtbaar.filter(o => o.type === 'plaatsing' && o.status === 'gepland')
  const teLaat = zichtbaar
    .filter(o => o.status === 'geplaatst')
    .map(o => ({ o, dagen: dagenSinds(o.datum_plaatsing ?? o.datum_gepland) }))
    .filter(x => x.dagen > 14)
    .sort((a, b) => b.dagen - a.dagen)

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8 flex flex-col gap-4">
      {/* Kop. Op mobiel zetten we alles onder elkaar (titel + knop op één regel,
          filter en periodekiezer daaronder op volle breedte); vanaf sm past het
          weer op één rij, met de knop achteraan via order. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="order-1 flex-1 text-2xl font-bold text-ink">Planning</h1>
        {!isChauffeur && (
          <div className="order-2 sm:order-5">
            <NieuwKnop
              label={tab === 'kalender' ? `Nieuwe opdracht op ${dagLabel}` : 'Nieuwe opdracht'}
              onClick={() => openNieuwOpDag(tab === 'kalender' ? geselecteerd : undefined)}
            />
          </div>
        )}
        {!isChauffeur && (
          <select
            value={chauffeurFilter ?? ''}
            onChange={e => setChauffeurFilter(e.target.value ? Number(e.target.value) : null)}
            style={selectChevron}
            className={`order-3 w-full min-h-10 pl-3 py-2 rounded-xl bg-surface border border-line text-xs font-medium text-ink-muted outline-none focus:border-accent/50 sm:w-auto ${selectRuimte}`}
          >
            <option value="" className="bg-app">Alle chauffeurs</option>
            {chauffeurs.map(c => <option key={c.id} value={c.id} className="bg-app">{c.name ?? c.username}</option>)}
          </select>
        )}
        {tab === 'kalender' && (
          <div className="order-4 flex w-full items-center gap-1 min-h-10 bg-surface border border-line rounded-xl overflow-hidden sm:w-auto">
            <button onClick={vorigeMaand} className="w-10 h-10 flex flex-shrink-0 items-center justify-center text-ink-subtle hover:text-ink hover:bg-fill transition-colors"><ChevronLeft size={16} /></button>
            <span className="flex-1 text-xs font-medium text-ink-muted px-2 text-center capitalize sm:w-40 sm:flex-none">{maandLabel}</span>
            <button onClick={volgendeMaand} className="w-10 h-10 flex flex-shrink-0 items-center justify-center text-ink-subtle hover:text-ink hover:bg-fill transition-colors"><ChevronRight size={16} /></button>
          </div>
        )}
        {tab === 'chauffeurs' && (
          <div className="order-4 flex w-full items-center gap-1 min-h-10 bg-surface border border-line rounded-xl overflow-hidden sm:w-auto">
            <button onClick={() => verschuifWeek(-1)} className="w-10 h-10 flex flex-shrink-0 items-center justify-center text-ink-subtle hover:text-ink hover:bg-fill transition-colors"><ChevronLeft size={16} /></button>
            <span className="flex-1 text-xs font-medium text-ink-muted px-2 text-center sm:w-44 sm:flex-none">
              {new Date(weekDagen[0] + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – {new Date(weekDagen[5] + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => verschuifWeek(1)} className="w-10 h-10 flex flex-shrink-0 items-center justify-center text-ink-subtle hover:text-ink hover:bg-fill transition-colors"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {zichtbareTabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto bg-surface border border-line rounded-xl p-1">
          {zichtbareTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 sm:px-5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.key ? t.actief : 'text-ink-muted hover:text-ink'}`}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.kort}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Kalender ── */}
      {tab === 'kalender' && (
        <>
          {/* Nog in te plannen — boven de kalender. Sleep een kaart op een dag
              hierboven/onder om de datum te zetten. */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface lg:hidden">
            <div className="border-b border-line px-3 py-2.5 text-xs font-semibold text-ink-muted">
              Nog in te plannen <span className="text-ink-subtle">({backlog.length})</span>
            </div>
            <div className="space-y-1 p-3">
              {backlog.length === 0
                ? <div className="py-2 text-center text-[11px] text-ink-subtle">Niets in te plannen</div>
                : backlog.map(o => (
                  <RitRegel key={o.id} o={o} onClick={() => openModal(o)}
                    sleepend={sleep?.id === o.documentId} grip={sleepGrip(o)} />
                ))}
            </div>
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <div className="border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-muted">Nog in te plannen <span className="text-ink-subtle">({backlog.length})</span></div>
            {backlog.length === 0
              ? <div className="p-4 text-center text-[11px] text-ink-subtle">Niets in te plannen</div>
              : (
                <div className="flex flex-wrap gap-2 p-3">
                  {backlog.map(o => (
                    <div key={o.id} className="w-48">
                      <OrderChip o={o} dragging={dragId === o.documentId}
                        onClick={() => openModal(o)} onDragStart={() => setDragId(o.documentId)} onDragEnd={() => { setDragId(null); setDropTarget(null) }} />
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-surface">
              {DAG_LABELS.map((d, i) => (
                <div key={d} className={`text-center text-[10px] font-semibold tracking-wide py-2.5 ${i === 0 ? 'text-ink-subtle' : 'text-ink-subtle'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cellen.map(dag => {
                const ds = fmt(dag)
                const isVandaag = ds === vandaagStr
                const isGesel = ds === geselecteerd
                const isZondag = dag.getDay() === 0
                // Zondagen en dagen die al geweest zijn: uitgegrijsd met diagonale
                // arcering. Blijven gewoon selecteerbaar/plaatsbaar.
                const gedimd = isZondag || ds < vandaagStr
                const items = laden ? [] : opDag(ds)
                const types = [...new Set(items.map(o => o.type))]
                const nietBesch = !laden && beschikbaarheid.some(b => dStr(b.datum) === ds && b.status === 'niet-beschikbaar')
                const dropCel = `null|${ds}`
                return (
                  // Ook drop-doel: sleep een backlog-kaart hierop → datum zetten
                  // (zonder chauffeur; die koppel je in de chauffeur-weergave).
                  <button key={ds} onClick={() => setGeselecteerd(ds)}
                    data-drop={dropCel}
                    onDragOver={e => { e.preventDefault(); setDropTarget(dropCel) }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={e => { e.preventDefault(); if (dragId) handleDrop(null, ds) }}
                    style={gedimd ? { backgroundImage: ARCERING } : undefined}
                    className={`relative p-1 sm:p-2 text-left border-b border-r border-line min-h-[64px] flex flex-col gap-1 transition-colors
                      ${dropTarget === dropCel ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : isGesel ? 'bg-accent/10 ring-1 ring-inset ring-accent/30' : 'hover:bg-fill'}`}>
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg ${
                      isVandaag ? 'bg-accent text-white' : isGesel ? 'text-accent' : gedimd ? 'text-ink-subtle' : 'text-ink-muted'}`}>{dag.getDate()}</span>
                    {(items.length > 0 || nietBesch) && (
                      <div className="flex flex-wrap items-center gap-0.5">
                        {types.slice(0, 3).map(t => <span key={t} className={`w-1.5 h-1.5 rounded-[2px] ${typeDot[t ?? ''] ?? 'bg-fill'}`} />)}
                        {items.length > 3 && <span className="text-[8px] text-ink-subtle font-bold self-center">+{items.length - 3}</span>}
                        {nietBesch && <span className="w-1.5 h-1.5 rounded-[2px] bg-danger" title="Chauffeur niet beschikbaar" />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-muted px-1">
            {(['plaatsing', 'ophaling', 'wisseling'] as const).map(t => (
              <span key={t} className="flex items-center gap-1.5 capitalize"><span className={`w-2 h-2 rounded-[2px] ${typeDot[t]}`} />{t}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px] bg-danger" />Niet beschikbaar</span>
          </div>

          {/* Dag-detail */}
          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Calendar size={14} className="text-accent" />
              <span className="text-xs font-semibold capitalize flex-1 text-ink">{dagLabel}</span>
              {!laden && <span className="text-[10px] text-ink-subtle">{geselOpdrachten.length} opdracht{geselOpdrachten.length !== 1 ? 'en' : ''}</span>}
            </div>
            {!laden && geselNietBeschikbaar.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-danger/5 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-danger">
                  <span className="w-1.5 h-1.5 rounded-[2px] bg-danger" /> Niet beschikbaar
                </span>
                {geselNietBeschikbaar.map(n => (
                  <span key={n.naam} className="text-xs text-ink-muted">
                    {n.naam} <span className="text-ink-subtle">({n.tekst})</span>
                  </span>
                ))}
              </div>
            )}
            {laden ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-surface rounded-xl animate-pulse" />)}</div>
            ) : geselOpdrachten.length === 0 ? (
              // Op uitgegrijsde dagen (zondag/verleden) of voor chauffeurs geen
              // "klik om aan te maken" — dan alleen platte tekst.
              isChauffeur || geselGedimd ? (
                <div className="px-4 py-8 text-center text-sm text-ink-subtle">Geen opdrachten gepland</div>
              ) : (
                <button onClick={() => openNieuwOpDag(geselecteerd)}
                  className="w-full px-4 py-8 text-center text-sm text-ink-subtle hover:text-accent hover:bg-fill transition-colors">
                  Geen opdrachten gepland — klik om er een aan te maken
                </button>
              )
            ) : (
              <div className="divide-y divide-line">
                {/* Op mobiel onder elkaar: type, klant + details, dan status en
                    chauffeur naast elkaar. Vanaf sm weer één rij. */}
                {geselOpdrachten.map(o => (
                  <button key={o.id} onClick={() => openModal(o)} className="w-full flex flex-col gap-1.5 px-4 py-3 hover:bg-fill transition-colors text-left sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-1.5 sm:w-20 sm:flex-shrink-0">
                      <div className={`w-2 h-2 rounded-[2px] ${typeDot[o.type ?? ''] ?? 'bg-fill'}`} />
                      <span className={`text-[10px] font-semibold tracking-wide ${typeText[o.type ?? ''] ?? 'text-ink-muted'}`}>{o.type}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{klantNaam(o.klant)}</div>
                      <div className="text-xs text-ink-subtle truncate">{[o.container?.container_code, formaatLabel(o.container?.formaat), o.adres].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:gap-3">
                      <StatusBadge status={o.status ?? '—'} kleur={opdrachtStatusKleur} />
                      {(o.chauffeur?.name ?? o.chauffeur?.username) ? (
                        <span className="flex items-center gap-1 text-xs text-ink-muted font-medium"><Truck size={12} className="text-ink-subtle" />{o.chauffeur.name ?? o.chauffeur.username}</span>
                      ) : (
                        <span className={`${BADGE} bg-amber-500/10 text-amber-600`}>Niet ingepland</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Wacht op plaatsing ── */}
      {tab === 'openstaand' && (
        <Lijst titel="Wacht op plaatsing" icon={<Clock size={14} className="text-amber-600" />} aantal={openstaand.length} leeg="Geen openstaande plaatsingen"
          rijen={openstaand.map(o => ({ o, badge: null }))} onClick={openModal} />
      )}

      {/* ── Te laat ── */}
      {tab === 'te-laat' && (
        <Lijst titel="Te laat ophalen" icon={<AlertTriangle size={14} className="text-danger" />} aantal={teLaat.length} leeg="Geen containers te laat"
          rijen={teLaat.map(x => ({ o: x.o, badge: (
            <span className={`${BADGE} ${x.dagen > 30 ? 'bg-danger/12 text-danger' : 'bg-amber-500/10 text-amber-600'}`}>{x.dagen}d</span>
          ) }))} onClick={openModal} />
      )}

      {/* ── Per chauffeur (weekrooster) — mobiel: dag voor dag onder elkaar ── */}
      {tab === 'chauffeurs' && (
        <div className="space-y-3 lg:hidden">
          {weekDagen.map(datum => {
            const dagD = new Date(datum + 'T12:00:00')
            const isVandaag = datum === vandaagStr
            const losseRitten = opdrachten.filter(o => dStr(o.datum_gepland) === datum && !o.chauffeur?.id)
            return (
              <div key={datum} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className={`flex items-center gap-2 border-b border-line px-3 py-2.5 ${isVandaag ? 'bg-ink/3' : 'bg-surface'}`}>
                  <span className="flex-1 text-xs font-semibold capitalize text-ink">
                    {dagD.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  {isVandaag && <span className={`${BADGE} bg-accent text-white`}>Vandaag</span>}
                </div>

                <div className="divide-y divide-line">
                  {gridChauffeurs.map(c => {
                    const ritten = opdrachten.filter(o => dStr(o.datum_gepland) === datum && o.chauffeur?.id === c.id)
                    const rijCel = `${c.id}|${datum}`
                    return (
                      // data-drop: laat je hier los, dan gaat de rit naar deze
                      // chauffeur op deze dag en blijft het dagdeel zoals het was.
                      <div key={c.id} data-drop={rijCel}
                        className={`px-3 py-2.5 transition-colors ${dropTarget === rijCel ? 'bg-accent/10' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-muted">{c.name ?? c.username}</span>
                          {/* O/M/A: tik voor opties, of sleep een rit hierop om 'm in dat dagdeel te zetten. */}
                          {DAGDELEN.map(dd => {
                            const cel = `${c.id}|${datum}|${dd.key}`
                            const b = besch(c.id, datum, dd.key)
                            return (
                              <button key={dd.key} data-drop={cel}
                                onClick={e => openDagdeelMenu(e, c.id, datum, dd.key)}
                                title={`${dd.label} — tik voor opties, of sleep een rit hierop`}
                                className={`flex size-10 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold transition-all ${
                                  dropTarget === cel
                                    ? 'bg-accent text-white ring-2 ring-accent/40 scale-110'
                                    : b ? 'bg-danger text-white' : 'bg-fill text-ink-muted active:bg-line'}`}>
                                {dd.kort}
                              </button>
                            )
                          })}
                        </div>
                        {ritten.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {ritten.map(o => (
                              <RitRegel key={o.id} o={o} onClick={() => openModal(o)}
                                sleepend={sleep?.id === o.documentId} grip={sleepGrip(o)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {(() => {
                    const cel = `null|${datum}`
                    if (losseRitten.length === 0 && !sleep) return null
                    return (
                      <div data-drop={cel}
                        className={`px-3 py-2.5 transition-colors ${dropTarget === cel ? 'bg-amber-500/15' : 'bg-amber-500/[0.04]'}`}>
                        <div className="mb-2 text-[10px] font-semibold tracking-wide text-amber-600/80">Niet ingepland</div>
                        {losseRitten.length === 0 ? (
                          <div className="h-10 rounded-lg border border-dashed border-line" />
                        ) : (
                          <div className="space-y-1">
                            {losseRitten.map(o => (
                              <RitRegel key={o.id} o={o} onClick={() => openModal(o)}
                                sleepend={sleep?.id === o.documentId} grip={sleepGrip(o)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}

          {/* Backlog: nog in te plannen opdrachten (zonder datum). Sleep ze aan
              het greepje op een chauffeur/dagdeel hierboven — of sleep een
              geplande rit hierheen (data-drop) om 'm te ontplannen. */}
          {(
            <div data-drop="backlog"
              className={`overflow-hidden rounded-2xl border border-dashed transition-colors ${dropTarget === 'backlog' ? 'border-accent bg-accent/10' : 'border-line bg-fill/60'}`}>
              <div className="border-b border-line px-3 py-2.5 text-xs font-semibold text-ink-muted">
                Nog in te plannen <span className="text-ink-subtle">({backlog.length})</span>
              </div>
              <div className="space-y-1 p-3">
                {backlog.length === 0
                  ? <div className="py-2 text-center text-[11px] text-ink-subtle">Sleep een rit hierheen om in de backlog te plaatsen</div>
                  : backlog.map(o => (
                    <RitRegel key={o.id} o={o} onClick={() => openModal(o)}
                      sleepend={sleep?.id === o.documentId} grip={sleepGrip(o)} />
                  ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10px] text-ink-muted">
            {(['plaatsing', 'ophaling', 'wisseling'] as const).map(t => (
              <span key={t} className="flex items-center gap-1 capitalize"><span className={`w-2 h-2 rounded-[2px] ${typeDot[t]}`} />{t}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-danger" />Niet beschikbaar</span>
            <span className="text-ink-subtle">Sleep een rit aan het greepje naar een chauffeur of dagdeel · tik O/M/A om in te plannen of op niet-beschikbaar te zetten · tik een rit om te bewerken</span>
          </div>
        </div>
      )}

      {tab === 'chauffeurs' && (
        <div className="hidden bg-surface rounded-2xl border border-line overflow-hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: `${Math.max(640, 80 + (gridChauffeurs.length + 1) * 200)}px` }}>
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="w-14 py-2.5 px-2 text-left text-[10px] font-semibold text-ink-subtle">Dag</th>
                  {gridChauffeurs.map(c => <th key={c.id} className="py-2.5 px-3 text-left text-[10px] font-semibold text-ink-muted min-w-[190px]">{c.name ?? c.username}</th>)}
                  <th className="py-2.5 px-3 text-left text-[10px] font-semibold text-ink-subtle min-w-[190px]">Niet ingepland</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {weekDagen.map(datum => {
                  const isVandaag = datum === vandaagStr
                  const dagD = new Date(datum + 'T12:00:00')
                  return (
                    <tr key={datum} className={isVandaag ? 'bg-ink/3' : ''}>
                      <td className="px-2 align-top border-r border-line">
                        <div className={`flex flex-col items-center w-10 rounded-xl py-2 mt-2 ${isVandaag ? 'bg-accent' : ''}`}>
                          <span className={`text-[10px] font-semibold ${isVandaag ? 'text-white' : 'text-ink-subtle'}`}>{DAG_LABELS[dagD.getDay()]}</span>
                          <span className={`text-sm font-bold mt-0.5 ${isVandaag ? 'text-white' : 'text-ink'}`}>{dagD.getDate()}</span>
                        </div>
                      </td>
                      {gridChauffeurs.map(c => (
                        <td key={c.id} className="align-top border-l border-line p-0">
                          {DAGDELEN.map((dd, di) => {
                            const cel = `${c.id}|${datum}|${dd.key}`
                            const b = besch(c.id, datum, dd.key)
                            const items = opdrachten.filter(o => dStr(o.datum_gepland) === datum && o.chauffeur?.id === c.id && dagdeelVan(o) === dd.key)
                            return (
                              <div key={dd.key}
                                className={`px-2 py-1.5 min-h-[44px] transition-colors ${di < 2 ? 'border-b border-line' : ''} ${dropTarget === cel ? 'bg-accent/15 ring-1 ring-inset ring-accent/30' : ''}`}
                                onDragOver={e => { e.preventDefault(); setDropTarget(cel) }}
                                onDragLeave={() => setDropTarget(null)}
                                onDrop={e => { e.preventDefault(); handleDrop(c.id, datum, dd.key) }}>
                                <button onClick={e => openDagdeelMenu(e, c.id, datum, dd.key)}
                                  title={`${dd.label} — klik voor opties`}
                                  className={`inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-all ${b ? 'bg-danger text-white' : 'bg-fill text-ink-muted hover:bg-line'}`}>
                                  {dd.kort}{b && <span className="font-normal opacity-80">— Niet beschikbaar</span>}
                                </button>
                                {items.map(o => (
                                  <OrderChip key={o.id} o={o} dragging={dragId === o.documentId}
                                    onClick={() => openModal(o)} onDragStart={() => setDragId(o.documentId)} onDragEnd={() => { setDragId(null); setDropTarget(null) }} />
                                ))}
                              </div>
                            )
                          })}
                        </td>
                      ))}
                      {(() => {
                        const cel = `null|${datum}`
                        const items = opdrachten.filter(o => dStr(o.datum_gepland) === datum && !o.chauffeur?.id)
                        return (
                          <td className={`px-2 py-2 align-top border-l border-line bg-surface transition-colors ${dropTarget === cel ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/20' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDropTarget(cel) }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={e => { e.preventDefault(); handleDrop(null, datum) }}>
                            {items.length === 0
                              ? <div className="h-10 rounded-lg border border-dashed border-line" />
                              : items.map(o => (
                                <OrderChip key={o.id} o={o} dragging={dragId === o.documentId}
                                  onClick={() => openModal(o)} onDragStart={() => setDragId(o.documentId)} onDragEnd={() => { setDragId(null); setDropTarget(null) }} />
                              ))}
                          </td>
                        )
                      })()}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Backlog: nog in te plannen opdrachten (zonder datum). Sleep een kaart
              naar een dagdeel/chauffeur hierboven om te plannen — of sleep een
              geplande kaart hierheen om 'm te ontplannen. */}
          {(
            <div
              onDragOver={e => { e.preventDefault(); setDropTarget('backlog') }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={e => { e.preventDefault(); if (dragId) handleUnplan(dragId) }}
              className={`border-t px-4 py-3 transition-colors ${dropTarget === 'backlog' ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <div className="mb-2 text-xs font-semibold text-ink-muted">Nog in te plannen <span className="text-ink-subtle">({backlog.length})</span></div>
              {backlog.length === 0
                ? <div className="rounded-lg border border-dashed border-line py-3 text-center text-[11px] text-ink-subtle">Sleep een kaart hierheen om in de backlog te plaatsen</div>
                : (
                  <div className="flex flex-wrap gap-2">
                    {backlog.map(o => (
                      <div key={o.id} className="w-48">
                        <OrderChip o={o} dragging={dragId === o.documentId}
                          onClick={() => openModal(o)} onDragStart={() => setDragId(o.documentId)} onDragEnd={() => { setDragId(null); setDropTarget(null) }} />
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
          <div className="border-t border-line px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-ink-muted">
            {(['plaatsing', 'ophaling', 'wisseling'] as const).map(t => <span key={t} className="flex items-center gap-1 capitalize"><span className={`w-2 h-2 rounded-[2px] ${typeDot[t]}`} />{t}</span>)}
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-danger" />Niet beschikbaar</span>
            <span className="text-ink-subtle">Sleep een kaart naar een dagdeel (O/M/A) om te herplannen · Klik O/M/A om in te plannen of op niet-beschikbaar te zetten · Klik kaart om te bewerken</span>
          </div>
        </div>
      )}

      {/* Zwevend kaartje onder je vinger tijdens het slepen op touch. */}
      {sleep && (() => {
        const o = opdrachten.find(x => x.documentId === sleep.id)
        if (!o) return null
        return (
          <div
            style={{ left: sleep.x, top: sleep.y }}
            className={`pointer-events-none fixed z-[60] max-w-[60vw] -translate-x-1/2 -translate-y-[150%] truncate rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-ink shadow-xl shadow-black/40 ${typeBg[o.type ?? ''] ?? 'bg-fill'}`}
          >
            {klantNaam(o.klant)}
          </div>
        )
      })()}

      {dagdeelMenu && (() => {
        const { chauffeurId, datum, dagdeel, x, y } = dagdeelMenu
        const b = besch(chauffeurId, datum, dagdeel)
        const dagdeelLabel = DAGDELEN.find(d => d.key === dagdeel)?.label ?? dagdeel
        const chauffeurLabel = chauffeurs.find(c => c.id === chauffeurId)
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDagdeelMenu(null)} />
            <div style={{ left: x, top: y }} className="fixed z-50 w-52 rounded-xl border border-line bg-app p-1 shadow-2xl">
              <div className="px-3 py-2 text-[10px] font-semibold tracking-wide text-ink-subtle">
                {chauffeurLabel?.name ?? chauffeurLabel?.username} · {dagdeelLabel}
              </div>
              <button
                onClick={() => planOpCel(chauffeurId, datum, dagdeel)}
                className="flex w-full min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-fill hover:text-ink"
              >
                <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white">
                  <Plus className="size-3.5" />
                </span>
                Opdracht inplannen
              </button>
              <button
                onClick={() => { setDagdeelMenu(null); toggleBesch(chauffeurId, datum, dagdeel) }}
                className="flex w-full min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-fill hover:text-ink"
              >
                <span className={`flex size-6 flex-shrink-0 items-center justify-center rounded-lg text-white ${b ? 'bg-accent' : 'bg-danger'}`}>
                  <Ban className="size-3.5" />
                </span>
                {b ? 'Weer beschikbaar maken' : 'Niet beschikbaar'}
              </button>
            </div>
          </>
        )
      })()}

      <OpdrachtModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={laad}
        opdracht={bewerken}
        klanten={klanten}
        containers={containers}
        chauffeurs={chauffeurOpties}
        onKlantToegevoegd={k => setKlanten(prev => [...prev, k])}
      />
    </div>
  )
}

// ── Gedeelde lijstweergave (openstaand / te-laat) ──────────────────
function Lijst({ titel, icon, aantal, leeg, rijen, onClick }: {
  titel: string; icon: React.ReactNode; aantal: number; leeg: string
  rijen: { o: Opdracht; badge: React.ReactNode }[]; onClick: (o: Opdracht) => void
}) {
  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        {icon}<span className="text-xs font-semibold flex-1 text-ink">{titel}</span>
        <span className="text-[10px] text-ink-subtle">{aantal}</span>
      </div>
      {rijen.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-ink-subtle">{leeg}</div>
      ) : (
        <div className="divide-y divide-line">
          {/* Zelfde mobiele opzet als de dag-detaillijst: chauffeur onder de klant. */}
          {rijen.map(({ o, badge }) => (
            <button key={o.id} onClick={() => onClick(o)} className="w-full flex flex-col gap-1.5 px-4 py-3 hover:bg-fill transition-colors text-left sm:flex-row sm:items-center sm:gap-3">
              {badge && <div className="flex-shrink-0 self-start sm:self-auto">{badge}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink truncate">{klantNaam(o.klant)}</div>
                <div className="text-xs text-ink-subtle truncate">{[o.container?.container_code, formaatLabel(o.container?.formaat), o.adres].filter(Boolean).join(' · ')}</div>
              </div>
              {(o.chauffeur?.name ?? o.chauffeur?.username) ? (
                <span className="flex items-center gap-1 text-xs text-ink-muted flex-shrink-0 font-medium"><Truck size={11} className="text-ink-subtle" />{o.chauffeur.name ?? o.chauffeur.username}</span>
              ) : (
                <span className={`${BADGE} self-start bg-amber-500/10 text-amber-600 sm:self-auto`}>Niet ingepland</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
