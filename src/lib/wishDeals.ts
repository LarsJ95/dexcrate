import { marketValue, type MarketValue } from './prices'
import type { CardmarketPrice } from './tcgdex'
import type { CardInput } from './types'
import { ownedForWish, type WishlistItem } from './wishlist'

export interface WishDeal {
  item: WishlistItem
  market: MarketValue
  /** Marktprijs valt binnen jouw max. prijs. */
  withinMax: boolean
}

/**
 * Wishlist deals op Overview: openstaande, gekoppelde wensen met een marktprijs.
 * Eerst wat binnen je max. prijs valt (grootste korting t.o.v. je max eerst), daarna de grootste dalers
 * van de afgelopen 30 dagen (goed moment om te kopen), bij gelijk de goedkoopste.
 * Prijzen die nog laden (ontbreken in de map) tellen nog niet mee.
 */
export function wishDeals(
  items: readonly WishlistItem[],
  cards: readonly CardInput[],
  prices: ReadonlyMap<string, CardmarketPrice | null>,
  limit = 5,
): WishDeal[] {
  const deals: WishDeal[] = []
  for (const item of items) {
    if (!item.tcgdex_id) continue
    if (ownedForWish(item, cards).owned >= item.wanted_qty) continue
    const market = marketValue(prices.get(item.tcgdex_id) ?? null, item.variant)
    if (!market) continue
    deals.push({ item, market, withinMax: item.max_price !== null && market.value <= item.max_price })
  }
  const discount = (d: WishDeal): number => (d.item.max_price ? (d.item.max_price - d.market.value) / d.item.max_price : 0)
  deals.sort((a, b) => {
    if (a.withinMax !== b.withinMax) return a.withinMax ? -1 : 1
    if (a.withinMax) return discount(b) - discount(a)
    const ca = a.market.change30 ?? Number.POSITIVE_INFINITY
    const cb = b.market.change30 ?? Number.POSITIVE_INFINITY
    return ca - cb || a.market.value - b.market.value
  })
  return deals.slice(0, limit)
}
