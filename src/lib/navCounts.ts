// Getallen naast menu-items: alleen waar je iets mee moet (0 = geen getal).
import { isUnlinked } from './collectionFilters'
import type { CardmarketPrice } from './tcgdex'
import type { Card, CardInput } from './types'
import { wishDeals } from './wishDeals'
import type { WishlistItem } from './wishlist'

/** Menu-items met een getal. */
export type BadgeKey = 'collection' | 'wishlist'

export interface NavCounts {
  /** Kaarten in bezit die nog niet aan de catalogus gekoppeld zijn (geen foto, prijs of set). */
  collection: number
  /** Wensen waarvan de marktprijs nu binnen je max. prijs valt. */
  wishlist: number
  /** Crate-stand voor het menu-item (null = geen Crate of onbekend). */
  crate: { points: number; freePack: boolean } | null
}

export const NO_COUNTS: NavCounts = { collection: 0, wishlist: 0, crate: null }

export function unlinkedCount(cards: readonly Pick<Card, 'kind' | 'tcgdex_id' | 'status'>[]): number {
  return cards.filter((c) => c.status !== 'sold' && isUnlinked(c)).length
}

/** Alleen wensen met een max. prijs kunnen "binnen je max" zijn: daarvoor zijn de prijzen nodig. */
export function wishesWithMax(items: readonly WishlistItem[]): WishlistItem[] {
  return items.filter((i) => i.tcgdex_id !== null && i.max_price !== null)
}

export function dealsWithinMax(items: readonly WishlistItem[], cards: readonly CardInput[], prices: ReadonlyMap<string, CardmarketPrice | null>): number {
  return wishDeals(wishesWithMax(items), cards, prices, Number.POSITIVE_INFINITY).filter((d) => d.withinMax).length
}
