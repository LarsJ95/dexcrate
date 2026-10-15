import type { ItemInput, SaleInput } from './types'

export interface Bucket {
  amount: number
  count: number
}

export interface Stats {
  sold: Bucket
  forSale: Bucket
  bought: Bucket
  net: number
  /** Verkocht als fractie (0–1) van alle kaarten op de verkooplijst. */
  sellRatio: number
  avgSold: number
  avgBought: number
  avgForSale: number
}

/** Rekent in centen om afrondingsfouten van floats te voorkomen. */
function bucket(items: readonly ItemInput[]): Bucket {
  let cents = 0
  let count = 0
  for (const it of items) {
    cents += it.quantity * Math.round(it.unit_price * 100)
    count += it.quantity
  }
  return { amount: cents / 100, count }
}

const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

/** Zelfde formules als het Excel-tabblad "Totaal"; aantallen tellen per stuk. */
export function computeStats(sales: readonly SaleInput[], purchases: readonly ItemInput[]): Stats {
  const sold = bucket(sales.filter((s) => s.sold))
  const forSale = bucket(sales.filter((s) => !s.sold))
  const bought = bucket(purchases)
  return {
    sold,
    forSale,
    bought,
    net: Math.round((sold.amount - bought.amount) * 100) / 100,
    sellRatio: safeDiv(sold.count, sold.count + forSale.count),
    avgSold: safeDiv(sold.amount, sold.count),
    avgBought: safeDiv(bought.amount, bought.count),
    avgForSale: safeDiv(forSale.amount, forSale.count),
  }
}

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
export const formatEur = (n: number): string => eur.format(n)
