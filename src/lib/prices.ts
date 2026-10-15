import type { CardmarketPrice } from './tcgdex'
import type { CardInput, Variant } from './types'

export interface MarketValue {
  value: number
  /** Welke Cardmarket-waarde gebruikt is. */
  basis: 'trend' | 'avg30' | 'avg7'
  /** Reverse-holoprijs gebruikt. */
  reverse: boolean
}

/**
 * Marktwaarde van één exemplaar: Cardmarket-trend, anders 30- of 7-daags gemiddelde.
 * Reverse holo gebruikt de "-holo"-prijzen; ontbreken die, dan geen waarde (de normale prijs zou misleiden).
 */
export function marketValue(p: CardmarketPrice | null | undefined, variant: Variant | null): MarketValue | null {
  if (!p) return null
  const reverse = variant === 'reverse'
  const [trend, avg30, avg7] = reverse ? [p.trendHolo, p.avg30Holo, p.avg7Holo] : [p.trend, p.avg30, p.avg7]
  if (trend !== null) return { value: trend, basis: 'trend', reverse }
  if (avg30 !== null) return { value: avg30, basis: 'avg30', reverse }
  if (avg7 !== null) return { value: avg7, basis: 'avg7', reverse }
  return null
}

export type PriceMap = ReadonlyMap<string, CardmarketPrice | null>

export function marketValueOf(card: CardInput, prices: PriceMap): MarketValue | null {
  if (card.kind !== 'card' || !card.tcgdex_id) return null
  return marketValue(prices.get(card.tcgdex_id), card.variant)
}

export interface MarketSummary {
  /** Kaarten in bezit (collectie + te koop). */
  owned: { value: number; withPrice: number; withoutPrice: number }
  /** Alleen kaarten in bezit met zowel aankoopprijs als marktwaarde. */
  paper: { cost: number; value: number; gain: number; count: number }
  /** Te koop: jouw vraagprijs vs. marktwaarde, alleen waar beide bekend zijn. */
  forSale: { asking: number; value: number; count: number }
  /** Gegradeerde kaarten: marktwaarde geldt voor ongegradeerd, dus apart gemeld. */
  graded: number
}

const cents = (n: number): number => Math.round(n * 100)

/** Alle bedragen in centen opgeteld om float-afrondingen te voorkomen; aantallen per stuk. */
export function summarizeMarket(cards: readonly CardInput[], prices: PriceMap): MarketSummary {
  let ownedValue = 0
  let withPrice = 0
  let withoutPrice = 0
  let paperCost = 0
  let paperValue = 0
  let paperCount = 0
  let asking = 0
  let askingValue = 0
  let askingCount = 0
  let graded = 0

  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card') continue
    if (c.grading_company) graded += c.quantity
    const mv = marketValueOf(c, prices)
    if (!mv) {
      withoutPrice += c.quantity
      continue
    }
    const mvc = c.quantity * cents(mv.value)
    ownedValue += mvc
    withPrice += c.quantity
    if (c.purchase_price !== null) {
      paperCost += c.quantity * cents(c.purchase_price)
      paperValue += mvc
      paperCount += c.quantity
    }
    if (c.status === 'for_sale' && c.sale_price !== null) {
      asking += c.quantity * cents(c.sale_price)
      askingValue += mvc
      askingCount += c.quantity
    }
  }

  return {
    owned: { value: ownedValue / 100, withPrice, withoutPrice },
    paper: { cost: paperCost / 100, value: paperValue / 100, gain: (paperValue - paperCost) / 100, count: paperCount },
    forSale: { asking: asking / 100, value: askingValue / 100, count: askingCount },
    graded,
  }
}
