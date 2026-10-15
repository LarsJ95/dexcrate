import type { SnapshotRow } from './prices'
import { supabase } from './supabase'
import {
  CONDITION_LABELS,
  GRADING_LABELS,
  LANGUAGE_LABELS,
  VARIANT_LABELS,
  type Card,
  type CardInput,
  type CardStatus,
} from './types'

const TABLE = 'cards'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Waarde alleen accepteren als die in de lijst met toegestane sleutels staat. */
function oneOf<K extends string>(v: unknown, allowed: Record<K, unknown>): K | null {
  return typeof v === 'string' && v in allowed ? (v as K) : null
}

const STATUSES: Record<CardStatus, true> = { collection: true, for_sale: true, sold: true }

/** Database-rij → getypeerd object; onverwachte vorm wordt overgeslagen. */
function toCard(r: unknown): Card | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return {
    id: r.id,
    user_id: str(r.user_id),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
    name: str(r.name),
    set_code: strOrNull(r.set_code),
    card_number: strOrNull(r.card_number),
    quantity: Math.max(1, Math.trunc(numOrNull(r.quantity) ?? 1)),
    kind: r.kind === 'sealed' ? 'sealed' : 'card',
    tcgdex_id: strOrNull(r.tcgdex_id),
    status: oneOf(r.status, STATUSES) ?? 'collection',
    language: oneOf(r.language, LANGUAGE_LABELS),
    condition: oneOf(r.condition, CONDITION_LABELS),
    variant: oneOf(r.variant, VARIANT_LABELS),
    grading_company: oneOf(r.grading_company, GRADING_LABELS),
    grade: numOrNull(r.grade),
    purchase_price: numOrNull(r.purchase_price),
    purchase_channel: strOrNull(r.purchase_channel),
    purchase_date: strOrNull(r.purchase_date),
    sale_price: numOrNull(r.sale_price),
    sale_channel: strOrNull(r.sale_channel),
    sale_date: strOrNull(r.sale_date),
    sort_order: Math.trunc(numOrNull(r.sort_order) ?? 0),
  }
}

function single(data: unknown): Card {
  const row = toCard(data)
  if (!row) throw new Error('Saving failed: unexpected response from the database.')
  return row
}

export async function listCards(): Promise<Card[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Loading failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => {
    const row = toCard(r)
    return row ? [row] : []
  })
}

export async function countCards(): Promise<number> {
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Counting failed: ${error.message}`)
  return count ?? 0
}

export async function insertCards(input: readonly CardInput[]): Promise<Card[]> {
  // Eén insert-statement: alles of niets.
  const { data, error } = await supabase.from(TABLE).insert(input).select('*')
  if (error) throw new Error(`Saving failed: ${error.message}`)
  return (data as unknown[]).map(single)
}

export async function insertCard(input: CardInput): Promise<Card> {
  const { data, error } = await supabase.from(TABLE).insert(input).select('*').single()
  if (error) throw new Error(`Saving failed: ${error.message}`)
  return single(data)
}

export async function updateCard(id: string, patch: Partial<CardInput>): Promise<Card> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`Saving failed: ${error.message}`)
  return single(data)
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(`Deleting failed: ${error.message}`)
}

export interface PriceSnapshot {
  takenOn: string
  trend: number | null
  trendHolo: number | null
}

/** Dagelijkse prijsopnames van één kaart, oud → nieuw (gevuld door de cron-job uit 004_price_snapshots.sql). */
export async function listSnapshots(tcgdexId: string): Promise<PriceSnapshot[]> {
  const { data, error } = await supabase
    .from('price_snapshots')
    .select('*')
    .eq('tcgdex_id', tcgdexId)
    .order('taken_on', { ascending: true })
    .limit(400)
  if (error) throw new Error(`Loading price history failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) =>
    isRecord(r) && typeof r.taken_on === 'string'
      ? [{ takenOn: r.taken_on, trend: numOrNull(r.trend), trendHolo: numOrNull(r.trend_holo) }]
      : [],
  )
}

/** Prijsopnames voor meerdere kaarten tegelijk (voor het waardeverloop van de collectie). */
export async function listSnapshotsFor(tcgdexIds: readonly string[]): Promise<SnapshotRow[]> {
  const out: SnapshotRow[] = []
  // In blokken, zodat de URL niet te lang wordt.
  for (let i = 0; i < tcgdexIds.length; i += 80) {
    const chunk = tcgdexIds.slice(i, i + 80)
    const { data, error } = await supabase
      .from('price_snapshots')
      .select('tcgdex_id, taken_on, trend, trend_holo')
      .in('tcgdex_id', chunk)
      .order('taken_on', { ascending: true })
      .limit(10000)
    if (error) throw new Error(`Loading value history failed: ${error.message}`)
    for (const r of data as unknown[]) {
      if (isRecord(r) && typeof r.tcgdex_id === 'string' && typeof r.taken_on === 'string') {
        out.push({ tcgdexId: r.tcgdex_id, takenOn: r.taken_on, trend: numOrNull(r.trend), trendHolo: numOrNull(r.trend_holo) })
      }
    }
  }
  return out
}

/**
 * Deel van een regel een andere status geven (bv. 1 van 3 verkopen):
 * nieuwe regel met `moved` stuks, origineel houdt de rest. Bij een fout wordt teruggedraaid.
 */
export async function splitCard(
  original: Card,
  moved: number,
  changes: CardInput,
): Promise<{ original: Card; created: Card }> {
  if (moved < 1 || moved >= original.quantity) throw new Error('Invalid quantity to split.')
  const created = await insertCard({ ...changes, quantity: moved })
  try {
    const updated = await updateCard(original.id, { quantity: original.quantity - moved })
    return { original: updated, created }
  } catch (err) {
    await deleteCard(created.id).catch((rollbackErr: unknown) => {
      console.error('Terugdraaien van splitsing mislukt', rollbackErr)
    })
    throw err
  }
}
