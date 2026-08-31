// Gedeelde formatters + statuskleuren voor het dashboard.

export function euro(bedrag: number | null | undefined): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag ?? 0)
}

/**
 * Toont een containerformaat netjes: de interne code "c6m3" wordt "6 m³"
 * (kubieke meter met superscript). De 'c'-prefix vervalt en "m3" krijgt een
 * hoog 3'tje. Formaten zonder m3 (portaal, haak, zeecontainer, …) blijven
 * ongewijzigd. Lege waarde → lege string (zodat filter(Boolean) 'm wegfiltert).
 */
export function formaatLabel(formaat?: string | null): string {
  if (!formaat) return ''
  return formaat
    .replace(/^c(?=\d)/i, '')            // "c6m3" → "6m3"
    .replace(/(\d)\s*m3\b/gi, '$1 m³')   // "6m3" → "6 m³"
    .replace(/m3\b/gi, 'm³')             // vangnet voor losse "m3"
}

/** Container-afbeelding per grootte: 1 m³, 3 m³ (ook voor 6/9), 20 m³, 40 m³. */
export function bakPin(formaat?: string | null): string {
  const maat = Number((formaat ?? '').match(/(\d+)\s*m3/i)?.[1] ?? 0)
  if (maat === 1) return '/img/bak-pin-1.png'
  if (maat === 20) return '/img/bak-pin-20.png'
  if (maat === 40) return '/img/bak-pin-40.png'
  return '/img/bak-pin-3.png'
}

/** "0 dagen" → "vandaag geplaatst", 1 → enkelvoud, anders "n dagen geplaatst". */
export function geplaatstLabel(dagen?: number | null): string {
  const n = dagen ?? 0
  if (n <= 0) return 'vandaag geplaatst'
  return `${n} ${n === 1 ? 'dag' : 'dagen'} geplaatst`
}

export function datum(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(dt)
}

export function datumTijd(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(dt)
}

export function datumKort(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(dt)
}

export const opdrachtStatusKleur: Record<string, string> = {
  gepland: 'bg-blue-500/15 text-blue-600',
  onderweg: 'bg-amber-500/15 text-amber-600',
  geplaatst: 'bg-accent/15 text-accent',
  opgehaald: 'bg-fill text-ink-muted',
  gewisseld: 'bg-purple-500/15 text-purple-600',
  geannuleerd: 'bg-danger/12 text-danger',
}

export const opdrachtTypeKleur: Record<string, string> = {
  plaatsing: 'bg-accent/15 text-accent',
  ophaling: 'bg-blue-500/15 text-blue-600',
  wisseling: 'bg-purple-500/15 text-purple-600',
}

export const containerStatusKleur: Record<string, string> = {
  beschikbaar: 'bg-accent/15 text-accent',
  geplaatst: 'bg-blue-500/15 text-blue-600',
  onderweg: 'bg-amber-500/15 text-amber-600',
  klaar_voor_ophaling: 'bg-purple-500/15 text-purple-600',
  opgehaald: 'bg-fill text-ink-muted',
  onderhoud: 'bg-danger/12 text-danger',
}

// Nette labels voor containerstatussen (o.a. voor de meerwoordige status).
export const containerStatusLabel: Record<string, string> = {
  beschikbaar: 'Beschikbaar',
  onderweg: 'Onderweg',
  geplaatst: 'Geplaatst',
  klaar_voor_ophaling: 'Klaar voor ophaling',
  opgehaald: 'Opgehaald',
  onderhoud: 'Onderhoud',
}

export const factuurStatusKleur: Record<string, string> = {
  concept: 'bg-fill text-ink-muted',
  verzonden: 'bg-blue-500/15 text-blue-600',
  betaald: 'bg-accent/15 text-accent',
  verlopen: 'bg-danger/12 text-danger',
}

export const rolKleur: Record<string, string> = {
  admin: 'bg-danger/12 text-danger',
  manager: 'bg-purple-500/15 text-purple-600',
  planner: 'bg-blue-500/15 text-blue-600',
  administratie: 'bg-amber-500/15 text-amber-600',
  chauffeur: 'bg-accent/15 text-accent',
}

export const beschikbaarheidKleur: Record<string, string> = {
  beschikbaar: 'bg-accent/15 text-accent',
  'niet-beschikbaar': 'bg-danger/12 text-danger',
  onzeker: 'bg-amber-500/15 text-amber-600',
}

export function klantNaam(k: { bedrijfsnaam?: string | null; voornaam?: string | null; achternaam?: string | null } | null | undefined): string {
  if (!k) return '—'
  if (k.bedrijfsnaam) return k.bedrijfsnaam
  return [k.voornaam, k.achternaam].filter(Boolean).join(' ') || '—'
}

export function cap(s: string | null | undefined): string {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1)
}
