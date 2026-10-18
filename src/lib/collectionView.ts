// Weergave van Collection: statusfilter, sortering en onthouden instellingen.
import { NO_EXTRA_FILTERS, parseView, type SavedView } from './collectionFilters'
import { STATUS_LABELS, type Card, type CardInput, type CardStatus } from './types'

export type StatusFilter = 'all' | 'owned' | CardStatus
/** 'list' = eigen volgorde oud → nieuw, 'newest' = dezelfde volgorde omgekeerd; in beide kun je slepen. */
export type SortKey = 'list' | 'newest' | 'priceDesc' | 'priceAsc' | 'marketDesc' | 'name' | 'set'
const SORTS: readonly SortKey[] = ['list', 'newest', 'priceDesc', 'priceAsc', 'marketDesc', 'name', 'set']
const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'owned', 'collection', 'for_sale', 'sold']

/** Weergave (zoeken, filters, sortering) per apparaat onthouden. */
export const VIEW_KEY = 'dexcrate:collection-view'
const DEFAULT_VIEW:SavedView<SortKey, StatusFilter> = { query: '', filter: 'owned', sort: 'list', extra: NO_EXTRA_FILTERS }

export function readView(): SavedView<SortKey, StatusFilter> {
  try {
    return parseView(localStorage.getItem(VIEW_KEY), SORTS, STATUS_FILTERS, DEFAULT_VIEW)
  } catch {
    return DEFAULT_VIEW // geen opslag: standaardweergave
  }
}

export const FILTERS: [StatusFilter, string][] = [
  ['owned', 'Owned'],
  ['collection', STATUS_LABELS.collection],
  ['for_sale', STATUS_LABELS.for_sale],
  ['sold', STATUS_LABELS.sold],
  ['all', 'All'],
]

/** Prijs die bij de status hoort, voor sorteren en totalen. */
export function relevantPrice(c: Card): number {
  return ownPrice(c) ?? 0
}

/** Eigen prijs (betaald, of vraag-/verkoopprijs); null = niet ingevuld. */
function ownPrice(c: CardInput): number | null {
  return c.status === 'collection' ? c.purchase_price : c.sale_price
}

/** Oplopend (dir 1) of aflopend (dir -1); ontbrekende waarden altijd onderaan. */
function compareMissingLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  return (a - b) * dir
}

/**
 * Sorteren op eigen prijs. Kaarten zonder prijs onderaan; bij gelijke (of geen) prijs beslist de marktwaarde,
 * in dezelfde richting. Anders gaven high → low en low → high dezelfde volgorde als er geen prijzen zijn ingevuld.
 */
export function comparePrice<T extends CardInput>(a: T, b: T, dir: 1 | -1, marketOf: (c: T) => number | null): number {
  return compareMissingLast(ownPrice(a), ownPrice(b), dir) || compareMissingLast(marketOf(a), marketOf(b), dir)
}

export function matchesFilter(c: Card, f: StatusFilter): boolean {
  if (f === 'all') return true
  if (f === 'owned') return c.status !== 'sold'
  return c.status === f
}
