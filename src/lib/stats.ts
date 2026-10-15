import type { CardInput } from './types'

export interface Bucket {
  /** Som van de bekende bedragen. */
  amount: number
  /** Aantal stuks in deze groep (met en zonder bedrag). */
  count: number
  /** Stuks zonder bekend bedrag: onbekend, niet meegeteld als 0. */
  unknown: number
}

export interface Stats {
  sold: Bucket
  forSale: Bucket
  bought: Bucket
  /** In bezit en niet te koop. */
  collection: Bucket
  net: number
  /** Stuks (alle statussen) zonder bekende aankoopprijs. */
  costUnknown: number
  /** Netto is alleen definitief als alle verkoopprijzen en aankoopprijzen bekend zijn. */
  netComplete: boolean
  /** Verkocht als fractie (0–1) van alles wat te koop staat of verkocht is. */
  sellRatio: number
  avgSold: number
  avgBought: number
  avgForSale: number
}

/** Rekent in centen om afrondingsfouten van floats te voorkomen. Ontbrekende prijs = onbekend, apart geteld. */
function bucket(items: readonly CardInput[], price: (c: CardInput) => number | null): Bucket {
  let cents = 0
  let count = 0
  let unknown = 0
  for (const it of items) {
    const p = price(it)
    count += it.quantity
    if (p === null) unknown += it.quantity
    else cents += it.quantity * Math.round(p * 100)
  }
  return { amount: cents / 100, count, unknown }
}

/** Gemiddelde over de stuks met een bekend bedrag. */
const avg = (b: Bucket): number => safeDiv(b.amount, b.count - b.unknown)


const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b)

/** Zelfde formules als het Excel-tabblad "Totaal"; aantallen tellen per stuk. */
export function computeStats(cards: readonly CardInput[]): Stats {
  const salePrice = (c: CardInput): number | null => c.sale_price
  const sold = bucket(cards.filter((c) => c.status === 'sold'), salePrice)
  const forSale = bucket(cards.filter((c) => c.status === 'for_sale'), salePrice)
  // "Gekocht" = alles met een aankoopprijs, ongeacht de huidige status.
  const bought = bucket(cards.filter((c) => c.purchase_price !== null), (c) => c.purchase_price)
  const collection = bucket(cards.filter((c) => c.status === 'collection'), (c) => c.purchase_price)
  const costUnknown = cards.reduce((n, c) => n + (c.purchase_price === null ? c.quantity : 0), 0)
  return {
    sold,
    forSale,
    bought,
    collection,
    net: Math.round((sold.amount - bought.amount) * 100) / 100,
    costUnknown,
    netComplete: sold.unknown === 0 && costUnknown === 0,
    sellRatio: safeDiv(sold.count, sold.count + forSale.count),
    avgSold: avg(sold),
    avgBought: avg(bought),
    avgForSale: avg(forSale),
  }
}

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
export const formatEur = (n: number): string => eur.format(n)
