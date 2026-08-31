'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { chauffeurBlocked, isActief, mobieleNav, zichtbareNav, type NavItem } from '@/lib/nav'
import { ArrowLeft, LayoutDashboard, LogOut } from 'lucide-react'

/**
 * Terug naar de vorige pagina. Alleen mobiel — hij hangt in de top-balk, en op
 * desktop navigeer je met de sidebar. Zelfde groene vorm als de scan- en
 * plus-knoppen zodat het als één set knoppen leest. Zonder geschiedenis
 * (deeplink of PWA die hier opstart) zou router.back() je de app uit sturen,
 * dus dan naar Home.
 */
function TerugKnop() {
  const router = useRouter()

  const terug = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  return (
    <button
      onClick={terug}
      aria-label="Terug"
      title="Terug"
      className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent/90 active:translate-y-px"
    >
      <ArrowLeft size={17} />
    </button>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { gebruiker, logout } = useAuth()
  const router = useRouter()
  const items = zichtbareNav(gebruiker?.rol)

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 h-screen flex-col border-r border-line bg-surface">
      <div className="px-6 py-5 border-b border-line">
        <div className="text-sm font-bold text-ink tracking-wide">Paterbak</div>
        <div className="text-xs text-ink-subtle mt-0.5">v2</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 min-h-10 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActief(pathname, href)
                ? 'bg-accent/15 text-accent'
                : 'text-ink-muted hover:text-ink hover:bg-fill'
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-line">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs text-ink-muted font-medium">{gebruiker?.name ?? gebruiker?.username}</div>
          <div className="text-xs text-ink-subtle capitalize">{gebruiker?.rol}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 min-h-10 px-3 py-2 rounded-lg text-sm bg-danger text-white hover:bg-danger/90 transition-colors"
        >
          <LogOut size={16} />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}

/** Initialen voor het account-blokje in de top-balk. */
function initialen(naam?: string) {
  const delen = (naam ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return delen.map(d => d[0]!.toUpperCase()).join('') || '?'
}

/**
 * Top-balk op mobiel: links terug en de Home-knop (de tegels daar geven toegang
 * tot álle onderdelen), rechts wie je bent — tik erop voor je account. Zo houdt
 * de tabbalk onderin plek voor drie tabs met de scanner exact in het midden.
 * Sticky binnen <main>, want dat is de scrollcontainer.
 */
function TopBalk() {
  const pathname = usePathname()
  const { gebruiker } = useAuth()
  const naam = gebruiker?.name ?? gebruiker?.username
  const opHome = pathname === '/dashboard'
  const opAccount = isActief(pathname, '/dashboard/instellingen')

  return (
    <header
      className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden"
      style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top))', paddingBottom: '0.625rem' }}
    >
      {/* Op Home zelf zou terug je de app uit sturen, dus daar laten we 'm weg. */}
      {!opHome && <TerugKnop />}

      <Link
        href="/dashboard"
        aria-current={opHome ? 'page' : undefined}
        className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors ${opHome ? '-ml-2 text-accent' : '-ml-1 text-ink active:bg-fill'}`}
      >
        <LayoutDashboard size={17} />
        Paterbak
      </Link>

      <Link
        href="/dashboard/instellingen"
        aria-current={opAccount ? 'page' : undefined}
        className="ml-auto flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 -mr-2 transition-colors active:bg-fill"
      >
        <span className="min-w-0 text-right">
          <span className="block truncate text-xs font-medium text-ink">{naam}</span>
          <span className="block text-[10px] capitalize text-ink-subtle">{gebruiker?.rol}</span>
        </span>
        <span
          className={`flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
            opAccount ? 'bg-accent text-white' : 'bg-fill text-ink-muted'
          }`}
        >
          {initialen(naam)}
        </span>
      </Link>
    </header>
  )
}

function Tab({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, kort, icon: Icon } = item
  const actief = isActief(pathname, href)

  return (
    <Link
      href={href}
      aria-current={actief ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
        actief ? 'text-accent' : 'text-ink-subtle active:text-ink'
      }`}
    >
      <Icon size={19} />
      <span className="truncate">{kort ?? label}</span>
    </Link>
  )
}

/**
 * De scanner midden in de tabbalk: een gevulde knop met dezelfde vorm en kleur
 * als de plus-knoppen elders in het dashboard (zie NieuwKnop). Geen label —
 * het icoon is duidelijk genoeg — en netjes onderaan uitgelijnd met de tabs
 * ernaast, dus hij steekt niet boven de balk uit.
 */
function ScanTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon } = item
  const actief = isActief(pathname, href)

  return (
    <div className="flex w-20 flex-shrink-0 items-end justify-center pb-2">
      <Link
        href={href}
        aria-current={actief ? 'page' : undefined}
        aria-label={label}
        title={label}
        className={`flex h-11 w-16 items-center justify-center rounded-lg text-white transition-colors active:translate-y-px ${
          actief ? 'bg-accent-hi text-white' : 'bg-accent active:bg-accent/90'
        }`}
      >
        <Icon size={22} />
      </Link>
    </div>
  )
}

/**
 * Tabbalk onderaan op mobiel: de scanner als knop prominent in het midden, met
 * links en rechts evenveel tabs (drie in totaal, of vijf) zodat hij écht
 * gecentreerd staat. Home en je account zitten in de top-balk. Vaste positie
 * met safe-area-inset zodat 'ie boven de iPhone-homebar blijft.
 */
function TabBalk() {
  const pathname = usePathname()
  const { gebruiker } = useAuth()
  const { links, midden, rechts } = mobieleNav(gebruiker?.rol)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Twee flex-1 groepen om de scanknop heen: die blijft zo exact in het
          midden, ook als links en rechts niet evenveel tabs hebben. */}
      <div className="flex items-stretch">
        <div className="flex flex-1 items-stretch">
          {links.map(item => <Tab key={item.href} item={item} pathname={pathname} />)}
        </div>
        {midden && <ScanTab item={midden} pathname={pathname} />}
        <div className="flex flex-1 items-stretch">
          {rechts.map(item => <Tab key={item.href} item={item} pathname={pathname} />)}
        </div>
      </div>
    </nav>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, laden, gebruiker } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!laden && !token) router.replace('/login')
  }, [laden, token, router])

  useEffect(() => {
    if (laden || !token || gebruiker?.rol !== 'chauffeur') return
    if (chauffeurBlocked.some(path => pathname === path || pathname.startsWith(`${path}/`))) {
      router.replace('/dashboard')
    }
  }, [gebruiker?.rol, laden, pathname, router, token])

  if (laden || !token) return null
  return <>{children}</>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="flex h-screen bg-app text-ink overflow-hidden">
          <Sidebar />
          {/* Kolom: op mobiel staat de top-balk hier als eerste, NIET-scrollend
              flex-item — zo blijft 'ie altijd bovenaan, los van de pagina en
              van sticky-context-issues (Lenis/GSAP transforms braken sticky op
              sommige pagina's). Alleen <main> eronder scrollt. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBalk />
            {/* data-lenis-prevent: dashboard is een app-tool met native scroll in
                <main>; Lenis (globale smooth-scroll voor de marketingsite) moet
                het muiswiel hier niet kapen. Ruime bottom-padding op mobiel:
                de vaste tabbalk (~3.5rem) + scanknop + iPhone-homebar
                (safe-area) mogen de inhoud nooit afdekken. */}
            <main
              data-lenis-prevent
              className="flex-1 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0"
            >
              {children}
            </main>
          </div>
          <TabBalk />
        </div>
      </AuthGuard>
    </AuthProvider>
  )
}
