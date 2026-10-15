import { isVoid, type Transaction } from './transactionTypes'

/** Minimale kaartgegevens voor de kostprijs. */
export interface CostCard {
  id: string
  purchase_price: number | null
  split_from: string | null
}

const cents = (n: number): number => Math.round(n * 100)

/**
 * Kostprijs per stuk van een kaartregel: aankoopprijs per stuk plus een evenredig deel van de
 * verzend- en overige kosten van de aankoop waar de kaart in zit. null = onbekend.
 * Zonder aankooptransactie telt alleen de aankoopprijs (er zijn dan geen bijkomende kosten vastgelegd).
 */
export function unitCost(
  cardId: string,
  cards: ReadonlyMap<string, CostCard>,
  purchases: readonly Transaction[],
): number | null {
  const card = cards.get(cardId)
  if (!card || card.purchase_price === null) return null
  // Gesplitste regel: de aankoop staat op de oorspronkelijke regel.
  const origin = card.split_from ?? card.id
  const purchase = purchases.find((t) => t.kind === 'purchase' && !isVoid(t.status) && t.lines.some((l) => l.card_id === origin || l.card_id === card.id))
  if (!purchase) return card.purchase_price
  if (purchase.shipping_amount === null || purchase.fees_amount === null) return null
  const units = purchase.lines.reduce((n, l) => n + l.quantity, 0)
  if (units === 0) return null
  return (cents(card.purchase_price) + (cents(purchase.shipping_amount) + cents(purchase.fees_amount)) / units) / 100
}

export interface SaleResult {
  /** Geannuleerd of retour: telt niet mee. */
  excluded: boolean
  /** Opbrengst: verkoopbedrag + ontvangen verzending − terugbetaling. */
  revenue: number | null
  /** Platform-, betaal-, verzend- en verpakkingskosten. */
  costs: number | null
  /** Kostprijs van de verkochte kaarten. */
  costBasis: number | null
  /** Resultaat; null zolang iets nodigs onbekend is. */
  result: number | null
  /** Wat ontbreekt voor een definitief resultaat. */
  missing: string[]
}

/**
 * Resultaat van één verkoop. Bedragen staan op transactieniveau, dus een lot telt opbrengst en kosten
 * precies één keer, ongeacht hoeveel kaarten erin zitten. Onbekend is nooit 0.
 */
export function saleResult(
  tx: Transaction,
  cards: ReadonlyMap<string, CostCard>,
  purchases: readonly Transaction[],
): SaleResult {
  if (isVoid(tx.status)) return { excluded: true, revenue: null, costs: null, costBasis: null, result: null, missing: [] }
  const missing: string[] = []
  if (tx.amount === null) missing.push('sale amount')
  if (tx.shipping_amount === null) missing.push('shipping received')
  if (tx.fees_amount === null) missing.push('fees')
  if (tx.shipping_cost === null) missing.push('shipping cost')

  let basisCents = 0
  let unknownCards = 0
  for (const l of tx.lines) {
    const unit = l.card_id ? unitCost(l.card_id, cards, purchases) : null
    if (unit === null) unknownCards += l.quantity
    else basisCents += l.quantity * cents(unit)
  }
  if (unknownCards > 0) missing.push(`purchase cost of ${unknownCards} ${unknownCards === 1 ? 'card' : 'cards'}`)

  const revenue =
    tx.amount !== null && tx.shipping_amount !== null
      ? (cents(tx.amount) + cents(tx.shipping_amount) - cents(tx.refund_amount ?? 0)) / 100
      : null
  const costs = tx.fees_amount !== null && tx.shipping_cost !== null ? (cents(tx.fees_amount) + cents(tx.shipping_cost)) / 100 : null
  const costBasis = unknownCards === 0 ? basisCents / 100 : null
  const result =
    revenue !== null && costs !== null && costBasis !== null ? (cents(revenue) - cents(costs) - cents(costBasis)) / 100 : null
  return { excluded: false, revenue, costs, costBasis, result, missing }
}

export interface RealizedSummary {
  /** Som van de verkopen waarvan alles bekend is. */
  result: number
  complete: number
  incomplete: number
  /** Verkopen in behandeling (betaling open, betaald, verzonden). */
  pending: number
}

/** Gerealiseerd resultaat: alleen volledige verkopen tellen mee; onvolledige worden apart geteld. */
export function realizedSummary(
  txs: readonly Transaction[],
  cards: ReadonlyMap<string, CostCard>,
): RealizedSummary {
  const purchases = txs.filter((t) => t.kind === 'purchase')
  let total = 0
  let complete = 0
  let incomplete = 0
  let pending = 0
  for (const tx of txs) {
    if (tx.kind !== 'sale') continue
    const r = saleResult(tx, cards, purchases)
    if (r.excluded) continue
    if (tx.status !== 'completed') pending += 1
    if (r.result === null) incomplete += 1
    else {
      total += cents(r.result)
      complete += 1
    }
  }
  return { result: total / 100, complete, incomplete, pending }
}

/** Gelijk verdelen van een lotbedrag over stuks, op de cent; de laatste stuks vangen het afrondingsverschil op. */
export function splitEvenly(total: number, quantities: readonly number[]): number[] {
  const units = quantities.reduce((n, q) => n + q, 0)
  if (units === 0) return quantities.map(() => 0)
  const totalCents = cents(total)
  const base = Math.floor(totalCents / units)
  let remainder = totalCents - base * units
  // Per regel een prijs per stuk; het restant gaat als hele centen naar de eerste regels met 1 stuk.
  return quantities.map((q) => {
    let unit = base
    if (remainder >= q && q > 0) {
      const extra = Math.floor(remainder / q) > 0 ? 1 : 0
      unit += extra
      remainder -= extra * q
    }
    return unit / 100
  })
}
