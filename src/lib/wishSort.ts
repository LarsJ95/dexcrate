import type { WishlistItem } from './wishlist'

/**
 * Sorteren in de Wishlist (24-10-2026, op verzoek: dezelfde keuzes als My cards). "Priority" is de oude volgorde
 * (zoals de database ze geeft: prioriteit, dan nieuwste); "Price" is je max. prijs.
 */
export type WishSort = 'priority' | 'newest' | 'list' | 'set' | 'marketDesc' | 'priceDesc' | 'priceAsc' | 'name'
export const WISH_SORTS: readonly WishSort[] = ['priority', 'newest', 'list', 'set', 'marketDesc', 'priceDesc', 'priceAsc', 'name']

export const WISH_SORT_LABELS: Record<WishSort, string> = {
  priority: 'Priority',
  newest: 'Newest first',
  list: 'Oldest first',
  set: 'Set and number',
  marketDesc: 'Market value',
  priceDesc: 'Max. price: high to low',
  priceAsc: 'Max. price: low to high',
  name: 'Name A–Z',
}

type Item = Pick<WishlistItem, 'id' | 'name' | 'set_code' | 'card_number' | 'max_price' | 'created_at'>

/** Zonder waarde (geen prijs) altijd achteraan, in beide richtingen. */
function byNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  return (a - b) * dir
}

/** Nieuwe lijst; gelijke rijen houden hun volgorde (de prioriteitsvolgorde van de database). */
export function sortWishes<T extends { item: Item }>(rows: readonly T[], sort: WishSort, marketOf: (item: Item) => number | null | undefined): T[] {
  const out = [...rows]
  const time = (r: T): string => r.item.created_at
  if (sort === 'newest') out.sort((a, b) => time(b).localeCompare(time(a)) || a.item.id.localeCompare(b.item.id))
  if (sort === 'list') out.sort((a, b) => time(a).localeCompare(time(b)) || a.item.id.localeCompare(b.item.id))
  if (sort === 'set') {
    out.sort(
      (a, b) =>
        (a.item.set_code ?? '').localeCompare(b.item.set_code ?? '', 'en') ||
        (Number.parseInt(a.item.card_number ?? '', 10) || 0) - (Number.parseInt(b.item.card_number ?? '', 10) || 0) ||
        a.item.name.localeCompare(b.item.name, 'en'),
    )
  }
  if (sort === 'marketDesc') out.sort((a, b) => byNumber(marketOf(a.item) ?? null, marketOf(b.item) ?? null, -1))
  if (sort === 'priceDesc') out.sort((a, b) => byNumber(a.item.max_price, b.item.max_price, -1))
  if (sort === 'priceAsc') out.sort((a, b) => byNumber(a.item.max_price, b.item.max_price, 1))
  if (sort === 'name') out.sort((a, b) => a.item.name.localeCompare(b.item.name, 'en'))
  return out
}
