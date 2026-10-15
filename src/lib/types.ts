export type ItemKind = 'card' | 'sealed'

/** Velden die verkoop- en aankoopregels delen (zonder database-velden). */
export interface ItemInput {
  name: string
  set_code: string | null
  card_number: string | null
  quantity: number
  unit_price: number
  channel: string | null
  kind: ItemKind
  tcgdex_id: string | null
  sort_order: number
}

export interface SaleInput extends ItemInput {
  sold: boolean
}

export type PurchaseInput = ItemInput

interface DbFields {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export type Sale = SaleInput & DbFields
export type Purchase = PurchaseInput & DbFields
