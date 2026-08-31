// Eén bron voor alle dashboardnavigatie: de sidebar (desktop), de tabbalk
// (mobiel) en het tegeloverzicht op de homepagina lezen hier allemaal uit.
import type { ElementType } from 'react'
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  CalendarDays,
  Truck,
  FileText,
  Bell,
  Map,
  QrCode,
  Smartphone,
  Settings,
  UserCog,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  /** Kortere variant voor de smalle tabbalk op mobiel. */
  kort?: string
  icon: ElementType
}

export const nav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', kort: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/containers', label: 'Containers', kort: 'Bakken', icon: Package },
  { href: '/dashboard/opdrachten', label: 'Opdrachten', kort: 'Werk', icon: ClipboardList },
  { href: '/dashboard/klanten', label: 'Klanten', icon: Users },
  { href: '/dashboard/planning', label: 'Planning', kort: 'Plan', icon: CalendarDays },
  { href: '/dashboard/chauffeurs', label: 'Chauffeurs', icon: Truck },
  { href: '/dashboard/gebruikers', label: 'Gebruikers', icon: UserCog },
  { href: '/dashboard/facturatie', label: 'Facturatie', kort: 'Facturen', icon: FileText },
  { href: '/dashboard/meldingen', label: 'Meldingen', kort: 'Meldingen', icon: Bell },
  { href: '/dashboard/kaart', label: 'Kaart', icon: Map },
  { href: '/dashboard/qr', label: 'QR Scanner', kort: 'Scan', icon: QrCode },
  { href: '/dashboard/app', label: 'App', kort: 'Ritten', icon: Smartphone },
  { href: '/dashboard/instellingen', label: 'Instellingen', kort: 'Instellen', icon: Settings },
]

export const chauffeurNav = new Set([
  '/dashboard',
  // De rittenapp is juist voor chauffeurs gemaakt — hij toont ze hun eigen
  // ritten — en is onderweg hun startpunt.
  '/dashboard/app',
  '/dashboard/planning',
  '/dashboard/kaart',
  '/dashboard/qr',
  '/dashboard/meldingen',
  '/dashboard/instellingen',
])

export const chauffeurBlocked = [
  '/dashboard/containers',
  '/dashboard/opdrachten',
  '/dashboard/klanten',
  '/dashboard/chauffeurs',
  '/dashboard/gebruikers',
  '/dashboard/facturatie',
]

/**
 * De tabbalk op mobiel: de QR-scanner staat áltijd in het midden, dus links en
 * rechts evenveel tabs — drie tabs in totaal, of vijf. Planning staat links,
 * rechts wat je rol het vaakst nodig heeft: de rittenapp voor een chauffeur
 * (eigen ritten afwerken), Opdrachten op kantoor.
 *
 * Home zit niet in de balk maar in de top-balk, samen met je naam; via de
 * tegels daar vind je álle andere onderdelen en je account terug.
 */
const MOBIEL_LINKS = ['/dashboard/planning']
const MOBIEL_MIDDEN = '/dashboard/qr'
const MOBIEL_RECHTS_CHAUFFEUR = ['/dashboard/app']
const MOBIEL_RECHTS_KANTOOR = ['/dashboard/opdrachten']

export interface MobieleBalk {
  links: NavItem[]
  midden?: NavItem
  rechts: NavItem[]
}

export function zichtbareNav(rol?: string): NavItem[] {
  return rol === 'chauffeur' ? nav.filter(i => chauffeurNav.has(i.href)) : nav
}

export function mobieleNav(rol?: string): MobieleBalk {
  const beschikbaar = zichtbareNav(rol)
  const pak = (hrefs: string[]) =>
    hrefs
      .map(href => beschikbaar.find(i => i.href === href))
      .filter((i): i is NavItem => Boolean(i))

  return {
    links: pak(MOBIEL_LINKS),
    midden: beschikbaar.find(i => i.href === MOBIEL_MIDDEN),
    rechts: pak(rol === 'chauffeur' ? MOBIEL_RECHTS_CHAUFFEUR : MOBIEL_RECHTS_KANTOOR),
  }
}

/** Actief als het pad exact matcht, of eronder valt (behalve /dashboard zelf). */
export function isActief(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}
