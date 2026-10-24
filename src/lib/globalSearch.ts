import type { Route } from './routes'
import { matchesSearch, matchesWords } from './search'
import { suggestSets } from './setSearch'
import { setOfKey, type Lang } from './tcgdex'
import type { Card } from './types'

/**
 * Zoeken overal (Ctrl+K, 21-10-2026, op verzoek): pagina's, sets in alle talen en je eigen kaarten.
 */

export interface SpotPage {
  route: Route
  label: string
}

/** Extra zoekwoorden per pagina, zodat "binder", "export" of "packs" ook de goede pagina vinden. */
const PAGE_WORDS: Partial<Record<Route, string>> = {
  overview: 'overview dashboard value worth',
  collection: 'collection cards',
  scan: 'camera photo recognise',
  sets: 'binder expansions series',
  wishlist: 'wishes wants deals lists',
  transactions: 'buy sell purchases sales profit',
  crate: 'packs points game crate',
  settings: 'account theme password appearance',
  import: 'excel csv spreadsheet dex collectr',
  backup: 'export download restore',
}

export const MAX_HITS = 6

/** Pagina's bij de zoektekst; zonder tekst allemaal (snel naar een pagina). */
export function findPages<T extends SpotPage>(pages: readonly T[], query: string): T[] {
  if (!query.trim()) return [...pages]
  return pages.filter((p) => matchesWords([p.label, PAGE_WORDS[p.route]], query)).slice(0, MAX_HITS)
}

export interface SpotSet {
  lang: Lang
  setId: string
  name: string
  logo: string | null
  /** Positie in de setlijst van die taal (hoger = nieuwer). */
  order: number
  /** Unieke kaarten in bezit. */
  owned: number
}

/** Sets bij de zoektekst, uit alle talen; `exact` (gevonden via een afkorting als MEW) komt bovenaan. */
export function findSets(sets: readonly SpotSet[], query: string, exact: { lang: Lang; setId: string } | null = null): SpotSet[] {
  if (!query.trim()) return []
  const top = exact ? sets.filter((s) => s.lang === exact.lang && s.setId === exact.setId) : []
  const rest = suggestSets(
    sets.filter((s) => !top.includes(s)),
    query,
    MAX_HITS - top.length,
  )
  return [...top, ...rest]
}

/**
 * Sets boven je eigen kaarten? Ja als je een afkorting typte (MEW) of de beste set met je tekst begint ("151",
 * "evolving"); bij een Pokémon-naam ("pikachu" → Detective Pikachu) eerst je eigen kaarten.
 */
export function setsFirst(found: readonly SpotSet[], query: string, exact: { lang: Lang; setId: string } | null): boolean {
  if (exact && found.some((s) => s.lang === exact.lang && s.setId === exact.setId)) return true
  const q = query.trim().toLowerCase()
  return q !== '' && found.length > 0 && found[0].name.toLowerCase().startsWith(q)
}

/** Unieke kaarten in bezit per set ("en/sv03.5"), voor de volgorde van de sets. */
export function ownedPerSet(cards: readonly Card[]): Map<string, number> {
  const ids = new Map<string, Set<string>>()
  for (const c of cards) {
    if (c.status === 'sold' || !c.tcgdex_id) continue
    const s = setOfKey(c.tcgdex_id)
    if (!s) continue
    const key = `${s.lang}/${s.setId}`
    ids.set(key, (ids.get(key) ?? new Set()).add(s.cardId))
  }
  return new Map([...ids].map(([k, v]) => [k, v.size]))
}

/** Je eigen kaarten bij de zoektekst: eerst namen die ermee beginnen, dan de rest. */
export function findCards(cards: readonly Card[], query: string): Card[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits = cards.filter((c) => matchesSearch(c, q))
  const starts = (c: Card): number => (c.name.toLowerCase().startsWith(q) ? 0 : 1)
  return hits.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'en')).slice(0, MAX_HITS)
}
