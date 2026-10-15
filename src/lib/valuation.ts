import type { SnapshotRow } from './prices'
import type { CardLanguage, Condition, Variant } from './types'

// --- TCGplayer (VS, USD): apart tonen, nooit stilletjes omrekenen naar een Europese prijs ---

export interface TcgplayerPrice {
  updated: string | null
  /** Per uitvoering (TCGdex-sleutel, bv. "reverse-holofoil") de marketPrice in USD. */
  prices: { key: string; market: number | null }[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function parseTcgplayer(data: Record<string, unknown>): TcgplayerPrice | null {
  const tp = isRecord(data.pricing) && isRecord(data.pricing.tcgplayer) ? data.pricing.tcgplayer : null
  if (!tp || tp.unit !== 'USD') return null
  const prices: TcgplayerPrice['prices'] = []
  for (const [key, value] of Object.entries(tp)) {
    if (key === 'unit' || key === 'updated' || !isRecord(value)) continue
    prices.push({ key, market: positive(value.marketPrice) })
  }
  if (prices.length === 0) return null
  return { updated: typeof tp.updated === 'string' ? tp.updated : null, prices }
}

/** TCGdex-sleutels per uitvoering; null = uitvoering onbekend (dan kiezen we niet). */
const TCGP_KEYS: Record<Variant, readonly string[]> = {
  normal: ['normal'],
  holo: ['holofoil'],
  reverse: ['reverse-holofoil'],
  firstEdition: ['1st-edition-holofoil', '1st-edition', '1st-edition-normal'],
}

/** TCGplayer-marktprijs voor precies deze uitvoering; is er maar één uitvoering bekend, dan die. */
export function tcgplayerFor(tp: TcgplayerPrice | null, variant: Variant | null): { key: string; market: number } | null {
  if (!tp) return null
  const keys = variant ? TCGP_KEYS[variant] : null
  const candidates = keys ? tp.prices.filter((p) => keys.includes(p.key)) : tp.prices.length === 1 ? tp.prices : []
  const hit = candidates.find((p) => p.market !== null)
  return hit && hit.market !== null ? { key: hit.key, market: hit.market } : null
}

export const TCGP_KEY_LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  'reverse-holofoil': 'Reverse holofoil',
  '1st-edition-holofoil': '1st edition holofoil',
  '1st-edition': '1st edition',
  '1st-edition-normal': '1st edition',
}

// --- Eigen instellingen: alleen schatten als je ze zelf hebt ingevuld ---

export interface UserSettings {
  /** Percentage van de marktprijs per conditie (100 = volle prijs). Ontbreekt = geen schatting. */
  conditionPct: Partial<Record<Condition, number>>
  /** Platform- en betaalkosten als percentage van de verkoopprijs. */
  saleFeePct: number | null
  /** Vaste kosten per verkoop (verzending, verpakking) in euro. */
  saleCostPerSale: number | null
  /** Standaardwaarden voor nieuwe kaarten; leeg = geen standaard. */
  defaults: NewCardDefaults
}

export interface NewCardDefaults {
  language: CardLanguage | null
  condition: Condition | null
  set_code: string | null
  location_id: string | null
}

export const EMPTY_SETTINGS: UserSettings = {
  conditionPct: {},
  saleFeePct: null,
  saleCostPerSale: null,
  defaults: { language: null, condition: null, set_code: null, location_id: null },
}

const cents = (n: number): number => Math.round(n * 100)

/** Schatting voor de conditie van jouw exemplaar; null als je voor die conditie geen percentage hebt ingesteld. */
export function conditionEstimate(market: number, condition: Condition | null, settings: UserSettings): { value: number; pct: number } | null {
  if (!condition) return null
  const pct = settings.conditionPct[condition]
  if (pct === undefined || !Number.isFinite(pct)) return null
  return { value: Math.round(market * pct) / 100, pct }
}

/**
 * Geschatte netto-opbrengst als je elk stuk los verkoopt: waarde − platformkosten − vaste kosten per verkoop.
 * null zolang de kosteninstellingen niet zijn ingevuld.
 */
export function netEstimate(valuePerCopy: number, copies: number, settings: UserSettings): number | null {
  if (settings.saleFeePct === null || settings.saleCostPerSale === null) return null
  const perCopy = cents(valuePerCopy) * (1 - settings.saleFeePct / 100) - cents(settings.saleCostPerSale)
  return Math.round(perCopy * copies) / 100
}

// --- Waardegroei: nieuwe aankopen apart van prijsbeweging ---

export interface Holding {
  tcgdexId: string
  quantity: number
  reverse: boolean
  /** Datum waarop je het exemplaar kreeg (aankoopdatum, anders toevoegdatum), jjjj-mm-dd. */
  acquiredOn: string
}

export interface GrowthSplit {
  from: string
  to: string
  /** Prijsbeweging van wat je op de begindatum al had. */
  priceEffect: number
  /** Waarde (op de einddatum) van wat er sindsdien bij kwam. */
  newPurchases: number
  /** Stuks zonder prijs op de begin- of einddatum: niet meegeteld. */
  unpriced: number
}

/** Laatst bekende prijs op of vóór een datum. */
function priceOn(rows: readonly SnapshotRow[], date: string, reverse: boolean): number | null {
  let best: SnapshotRow | null = null
  for (const r of rows) if (r.takenOn <= date && (!best || r.takenOn > best.takenOn)) best = r
  if (!best) return null
  return reverse ? best.trendHolo : best.trend
}

/**
 * Waardeverandering tussen de eerste en laatste opname, gesplitst in prijsbeweging (bezit van vóór de
 * begindatum) en nieuwe aankopen. null als er minder dan twee opnamedagen zijn.
 */
export function growthSplit(holdings: readonly Holding[], snapshots: readonly SnapshotRow[]): GrowthSplit | null {
  const dates = [...new Set(snapshots.map((s) => s.takenOn))].sort()
  if (dates.length < 2) return null
  const from = dates[0]
  const to = dates[dates.length - 1]
  const byCard = new Map<string, SnapshotRow[]>()
  for (const s of snapshots) byCard.set(s.tcgdexId, [...(byCard.get(s.tcgdexId) ?? []), s])
  let price = 0
  let fresh = 0
  let unpriced = 0
  for (const h of holdings) {
    const rows = byCard.get(h.tcgdexId) ?? []
    const end = priceOn(rows, to, h.reverse)
    if (h.acquiredOn > from) {
      if (end === null) unpriced += h.quantity
      else fresh += h.quantity * cents(end)
      continue
    }
    const start = priceOn(rows, from, h.reverse)
    if (start === null || end === null) unpriced += h.quantity
    else price += h.quantity * (cents(end) - cents(start))
  }
  return { from, to, priceEffect: price / 100, newPurchases: fresh / 100, unpriced }
}

// --- Waardeoverzicht van wat je nu bezit: vier bedragen, nooit door elkaar ---

export interface BreakdownCard {
  id: string
  quantity: number
  ownership: 'incoming' | 'owned' | 'sold' | 'traded' | 'given_away'
  purchase_price: number | null
}

export interface CollectionBreakdown {
  /** Stuks in bezit (onderweg niet meegeteld). */
  copies: number
  /** Stuks onderweg (in geen enkel bedrag meegeteld). */
  incoming: number
  /** Aankoopkosten van wat je bezit, alleen waar bekend. */
  cost: { amount: number; unknown: number }
  /** Indicatieve marktwaarde (Cardmarket), alleen waar bekend. */
  market: { amount: number; unknown: number }
  /** Jouw eigen waarderingen, alleen voor kaarten waar je er een gaf. */
  yours: { amount: number; copies: number }
  /** Geschatte netto-opbrengst bij losse verkoop; null zolang de kosteninstellingen ontbreken. */
  net: { amount: number; copies: number } | null
}

export function collectionBreakdown(
  cards: readonly BreakdownCard[],
  marketOf: (id: string) => number | null,
  ownValueOf: (id: string) => number | null,
  settings: UserSettings,
): CollectionBreakdown {
  let copies = 0
  let incoming = 0
  let cost = 0
  let costUnknown = 0
  let market = 0
  let marketUnknown = 0
  let yours = 0
  let yoursCopies = 0
  let net = 0
  let netCopies = 0
  const netReady = settings.saleFeePct !== null && settings.saleCostPerSale !== null
  for (const c of cards) {
    if (c.ownership === 'incoming') {
      incoming += c.quantity
      continue
    }
    if (c.ownership !== 'owned') continue
    copies += c.quantity
    if (c.purchase_price === null) costUnknown += c.quantity
    else cost += c.quantity * cents(c.purchase_price)
    const m = marketOf(c.id)
    if (m === null) marketUnknown += c.quantity
    else {
      market += c.quantity * cents(m)
      const n = netEstimate(m, c.quantity, settings)
      if (n !== null) {
        net += cents(n)
        netCopies += c.quantity
      }
    }
    const own = ownValueOf(c.id)
    if (own !== null) {
      yours += c.quantity * cents(own)
      yoursCopies += c.quantity
    }
  }
  return {
    copies,
    incoming,
    cost: { amount: cost / 100, unknown: costUnknown },
    market: { amount: market / 100, unknown: marketUnknown },
    yours: { amount: yours / 100, copies: yoursCopies },
    net: netReady ? { amount: net / 100, copies: netCopies } : null,
  }
}
