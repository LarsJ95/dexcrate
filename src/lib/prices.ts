import type { CardmarketPrice } from './tcgdex'
import type { CardInput, Variant } from './types'

export interface MarketValue {
  value: number
  /** Welke Cardmarket-waarde gebruikt is. */
  basis: 'trend' | 'avg30' | 'avg7'
  /** Reverse-holoprijs gebruikt. */
  reverse: boolean
  /** Beweging: trend t.o.v. 30-daags gemiddelde (0,1 = +10%); null als niet te bepalen. */
  change30: number | null
}

const change = (now: number | null, base: number | null): number | null =>
  now !== null && base !== null && base > 0 ? now / base - 1 : null

/**
 * Marktwaarde van één exemplaar: Cardmarket-trend, anders 30- of 7-daags gemiddelde.
 * Reverse holo gebruikt de "-holo"-prijzen; ontbreken die, dan geen waarde (de normale prijs zou misleiden).
 */
export function marketValue(p: CardmarketPrice | null | undefined, variant: Variant | null): MarketValue | null {
  if (!p) return null
  const reverse = variant === 'reverse'
  const [trend, avg30, avg7] = reverse ? [p.trendHolo, p.avg30Holo, p.avg7Holo] : [p.trend, p.avg30, p.avg7]
  if (trend !== null) return { value: trend, basis: 'trend', reverse, change30: change(trend, avg30) }
  if (avg30 !== null) return { value: avg30, basis: 'avg30', reverse, change30: null }
  if (avg7 !== null) return { value: avg7, basis: 'avg7', reverse, change30: change(avg7, avg30) }
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
  /** Gewogen beweging van alles in bezit t.o.v. het 30-daags gemiddelde; null als onbekend. */
  change30: number | null
}

export interface Mover<T extends CardInput = CardInput> {
  card: T
  market: MarketValue
}

/** Minimale waarde om mee te tellen bij stijgers/dalers: bij centenkaarten is ±50% ruis. */
const MOVER_MIN_VALUE = 0.5

/** Stijgers, dalers en meest waardevolle kaarten in bezit (één regel per kaart+variant). */
export function topMovers<T extends CardInput>(
  cards: readonly T[],
  prices: PriceMap,
  n = 5,
): { up: Mover<T>[]; down: Mover<T>[]; valuable: Mover<T>[] } {
  const seen = new Set<string>()
  const list: Mover<T>[] = []
  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card' || !c.tcgdex_id) continue
    const key = `${c.tcgdex_id}|${c.variant ?? ''}`
    if (seen.has(key)) continue
    const market = marketValueOf(c, prices)
    if (!market) continue
    seen.add(key)
    list.push({ card: c, market })
  }
  const moving = list.filter((m) => m.market.change30 !== null && m.market.value >= MOVER_MIN_VALUE)
  const byChange = (a: Mover<T>, b: Mover<T>): number => (b.market.change30 ?? 0) - (a.market.change30 ?? 0)
  return {
    up: moving.filter((m) => (m.market.change30 ?? 0) > 0.02).sort(byChange).slice(0, n),
    down: moving.filter((m) => (m.market.change30 ?? 0) < -0.02).sort(byChange).reverse().slice(0, n),
    valuable: [...list].sort((a, b) => b.market.value - a.market.value).slice(0, n),
  }
}

export interface SnapshotRow {
  tcgdexId: string
  takenOn: string
  trend: number | null
  trendHolo: number | null
}

export interface SeriesPoint {
  date: string
  value: number
}

/**
 * Waardeverloop van je huidige bezit uit dagelijkse opnames.
 * Ontbreekt een kaart op een dag, dan telt de laatst bekende prijs (geen kunstmatige dips).
 */
export function portfolioSeries(cards: readonly CardInput[], snapshots: readonly SnapshotRow[]): SeriesPoint[] {
  const holdings = new Map<string, { qty: number; reverse: boolean }[]>()
  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card' || !c.tcgdex_id) continue
    const list = holdings.get(c.tcgdex_id) ?? []
    list.push({ qty: c.quantity, reverse: c.variant === 'reverse' })
    holdings.set(c.tcgdex_id, list)
  }
  const byDate = new Map<string, SnapshotRow[]>()
  for (const s of snapshots) {
    if (!holdings.has(s.tcgdexId)) continue
    const rows = byDate.get(s.takenOn) ?? []
    rows.push(s)
    byDate.set(s.takenOn, rows)
  }
  const last = new Map<string, SnapshotRow>()
  const points: SeriesPoint[] = []
  for (const date of [...byDate.keys()].sort()) {
    for (const s of byDate.get(date) ?? []) last.set(s.tcgdexId, s)
    let total = 0
    for (const [key, held] of holdings) {
      const s = last.get(key)
      if (!s) continue
      for (const h of held) total += h.qty * cents((h.reverse ? s.trendHolo : s.trend) ?? 0)
    }
    points.push({ date, value: total / 100 })
  }
  return points
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
  let changeNow = 0
  let changeBase = 0

  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card') continue
    if (c.grading_company) graded += c.quantity
    const mv = marketValueOf(c, prices)
    if (!mv) {
      withoutPrice += c.quantity
      continue
    }
    if (mv.change30 !== null) {
      changeNow += c.quantity * mv.value
      changeBase += c.quantity * (mv.value / (1 + mv.change30))
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
    change30: changeBase > 0 ? changeNow / changeBase - 1 : null,
  }
}
