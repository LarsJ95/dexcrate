import { supabase } from './supabase'
import type { ItemKind, Purchase, PurchaseInput, Sale, SaleInput } from './types'

export type Table = 'sales' | 'purchases'
export type Row<T extends Table> = T extends 'sales' ? Sale : Purchase
export type Input<T extends Table> = T extends 'sales' ? SaleInput : PurchaseInput

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const kind = (v: unknown): ItemKind => (v === 'sealed' ? 'sealed' : 'card')

/** Database-rij → getypeerd object; onverwachte vorm wordt overgeslagen. */
function toItem(r: unknown): Purchase | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return {
    id: r.id,
    user_id: str(r.user_id),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    name: str(r.name),
    set_code: strOrNull(r.set_code),
    card_number: strOrNull(r.card_number),
    quantity: Math.max(1, Math.trunc(num(r.quantity))),
    unit_price: num(r.unit_price),
    channel: strOrNull(r.channel),
    kind: kind(r.kind),
    tcgdex_id: strOrNull(r.tcgdex_id),
    sort_order: Math.trunc(num(r.sort_order)),
  }
}

function toRow<T extends Table>(table: T, r: unknown): Row<T> | null {
  const item = toItem(r)
  if (!item) return null
  if (table === 'purchases') return item as Row<T>
  return { ...item, sold: isRecord(r) && r.sold === true } as Row<T>
}

export async function listItems<T extends Table>(table: T): Promise<Row<T>[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Laden mislukt: ${error.message}`)
  return (data as unknown[]).flatMap((r) => {
    const row = toRow(table, r)
    return row ? [row] : []
  })
}

export async function insertItem<T extends Table>(table: T, input: Input<T>): Promise<Row<T>> {
  const { data, error } = await supabase.from(table).insert(input).select('*').single()
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  const row = toRow(table, data)
  if (!row) throw new Error('Opslaan mislukt: onverwacht antwoord van de database.')
  return row
}

export async function updateItem<T extends Table>(table: T, id: string, patch: Partial<Input<T>>): Promise<Row<T>> {
  // Zonder gegenereerde DB-types kan supabase-js het generieke Input<T> niet narrowen.
  const { data, error } = await supabase
    .from(table)
    .update(patch as Partial<SaleInput>)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
  const row = toRow(table, data)
  if (!row) throw new Error('Opslaan mislukt: onverwacht antwoord van de database.')
  return row
}

export async function deleteItem(table: Table, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(`Verwijderen mislukt: ${error.message}`)
}
