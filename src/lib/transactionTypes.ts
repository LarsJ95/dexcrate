export type TxKind = 'purchase' | 'sale' | 'trade' | 'gift_in' | 'gift_out'
export type TxStatus = 'open' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'returned'

export const TX_KIND_LABELS: Record<TxKind, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  trade: 'Trade',
  gift_in: 'Gift received',
  gift_out: 'Gift given',
}

export const TX_STATUS_LABELS: Record<TxStatus, string> = {
  open: 'Payment open',
  paid: 'Paid',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
}

/** Geannuleerd of retour: telt niet mee in resultaten, kaarten zijn terug in bezit. */
export const isVoid = (s: TxStatus): boolean => s === 'cancelled' || s === 'returned'

export interface TxLine {
  id: string
  card_id: string | null
  quantity: number
  /** Bedrag per stuk; null = deel van een lot zonder (bekende) verdeling. */
  unit_amount: number | null
}

export interface Transaction {
  id: string
  kind: TxKind
  occurred_on: string | null
  channel: string | null
  counterparty: string | null
  /** Kaarten zelf (aankoopprijs of verkoopopbrengst), zonder verzending; null = onbekend. */
  amount: number | null
  /** Aankoop: betaalde verzending. Verkoop: ontvangen verzendbijdrage. */
  shipping_amount: number | null
  /** Aankoop: overige kosten. Verkoop: platform- en betaalkosten. */
  fees_amount: number | null
  /** Verkoop: werkelijke verzend- en verpakkingskosten. */
  shipping_cost: number | null
  /** Terugbetaald; null = niets terugbetaald. */
  refund_amount: number | null
  status: TxStatus
  notes: string | null
  created_at: string
  lines: TxLine[]
}
