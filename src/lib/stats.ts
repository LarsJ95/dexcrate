import type { CardInput } from './types'

export interface Bucket {
  amount: number
  count: number
}

export interface Stats {
  sold: Bucket
  forSale: Bucket
  bought: Bucket
  /** In bezit en niet te koop. */
  collection: Bucket
  net: number
  /** Verkocht als fractie (0–1) van alles wat te koop staat of verkocht is. */
  sellRatio: number
  avgSold: number
  avgBought: number
  avgForSale: number
}

/** Rekent in centen om afrondingsfouten van floats te voorkomen. Ontbrekende prijs telt als 0. */
function bucket(items: readonly CardInput[], price: (c: CardInput) => number | null): Bucket {
  let cents = 0
  let count = 0
  for (const it of items) {
    cents += it.quantity * Math.round((price(it) ?? 0) * 100)
    count += it.quantity
  }
  return { amount: cents / 100, count }
}

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

/** Zelfde formules als het Excel-tabblad "Totaal"; aantallen tellen per stuk. */
export function computeStats(cards: readonly CardInput[]): Stats {
  const salePrice = (c: CardInput): number | null => c.sale_price
  const sold = bucket(cards.filter((c) => c.status === 'sold'), salePrice)
  const forSale = bucket(cards.filter((c) => c.status === 'for_sale'), salePrice)
  // "Gekocht" = alles met een aankoopprijs, ongeacht de huidige status.
  const bought = bucket(cards.filter((c) => c.purchase_price !== null), (c) => c.purchase_price)
  const collection = bucket(cards.filter((c) => c.status === 'collection'), (c) => c.purchase_price)
  return {
    sold,
    forSale,
    bought,
    collection,
    net: Math.round((sold.amount - bought.amount) * 100) / 100,
    sellRatio: safeDiv(sold.count, sold.count + forSale.count),
    avgSold: safeDiv(sold.amount, sold.count),
    avgBought: safeDiv(bought.amount, bought.count),
    avgForSale: safeDiv(forSale.amount, forSale.count),
  }
}

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
export const formatEur = (n: number): string => eur.format(n)
