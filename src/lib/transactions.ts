import { supabase } from './supabase'
import { TX_KIND_LABELS, TX_STATUS_LABELS, type Transaction, type TxLine, type TxStatus } from './transactionTypes'

const TABLE = 'transactions'
const SELECT = '*, transaction_lines(id, card_id, quantity, unit_amount)'
const RECEIPTS = 'receipts'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
function oneOf<K extends string>(v: unknown, allowed: Record<K, unknown>): K | null {
  return typeof v === 'string' && v in allowed ? (v as K) : null
}

function toLine(r: unknown): TxLine | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return { id: r.id, card_id: strOrNull(r.card_id), quantity: Math.max(1, Math.trunc(numOrNull(r.quantity) ?? 1)), unit_amount: numOrNull(r.unit_amount) }
}

/** Database-rij → transactie; onverwachte vorm wordt overgeslagen. */
export function toTransaction(r: unknown): Transaction | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  const kind = oneOf(r.kind, TX_KIND_LABELS)
  if (!kind) return null
  return {
    id: r.id,
    kind,
    occurred_on: strOrNull(r.occurred_on),
    channel: strOrNull(r.channel),
    counterparty: strOrNull(r.counterparty),
    amount: numOrNull(r.amount),
    shipping_amount: numOrNull(r.shipping_amount),
    fees_amount: numOrNull(r.fees_amount),
    shipping_cost: numOrNull(r.shipping_cost),
    refund_amount: numOrNull(r.refund_amount),
    status: oneOf(r.status, TX_STATUS_LABELS) ?? 'completed',
    notes: strOrNull(r.notes),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    lines: Array.isArray(r.transaction_lines) ? r.transaction_lines.flatMap((l: unknown) => toLine(l) ?? []) : [],
  }
}

let schemaCheck: Promise<boolean> | null = null

/** True als STAP5 (transacties) in de database staat. */
export function hasTransactions(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from(TABLE).select('id').limit(1)
    if (!error) return true
    // Tabel bestaat niet (Postgres 42P01 of PostgREST "schema cache").
    if (error.code === '42P01' || error.code === 'PGRST205' || /transactions|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

/** Alleen voor de ontwerppreview (dev). */
export function overrideTransactionsForPreview(v: boolean): void {
  schemaCheck = Promise.resolve(v)
}

/** Alle transacties, nieuwste eerst. */
export async function listTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT)
    .order('occurred_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Loading transactions failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toTransaction(r) ?? [])
}

export interface SaleInput {
  occurred_on: string | null
  channel: string | null
  counterparty: string | null
  /** Totaal voor de kaarten; null = onbekend. */
  amount: number | null
  shipping_amount: number | null
  fees_amount: number | null
  shipping_cost: number | null
  status: Exclude<TxStatus, 'cancelled' | 'returned'>
  notes: string | null
  /** Per kaartregel: aantal en (optioneel) bedrag per stuk; null = lot zonder verdeling. */
  lines: { card_id: string; quantity: number; unit_amount: number | null }[]
}

/** Verkoop in één keer vastleggen (splitsen, status, transactie) via de databasefunctie record_sale. */
export async function recordSale(input: SaleInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_sale', { p: input })
  if (error) throw new Error(`Saving the sale failed: ${error.message}`)
  if (typeof data !== 'string') throw new Error('Saving the sale failed: unexpected response.')
  return data
}

export interface PurchaseInput {
  occurred_on: string | null
  channel: string | null
  counterparty: string | null
  amount: number | null
  shipping_amount: number | null
  fees_amount: number | null
  notes: string | null
  /** Onderweg-kaarten meteen als ontvangen markeren. */
  received: boolean
  /** Hele kaartregels; bedrag per stuk optioneel (null = lot zonder verdeling). */
  lines: { card_id: string; unit_amount: number | null }[]
}

export async function recordPurchase(input: PurchaseInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_purchase', { p: input })
  if (error) throw new Error(`Saving the purchase failed: ${error.message}`)
  if (typeof data !== 'string') throw new Error('Saving the purchase failed: unexpected response.')
  return data
}

/** Status van een verkoop. Annuleren/retour zet de kaarten terug in bezit (te koop). */
export async function setSaleStatus(id: string, status: TxStatus, refund: number | null = null): Promise<void> {
  const { error } = await supabase.rpc('set_sale_status', { p_id: id, p_status: status, p_refund: refund })
  if (error) throw new Error(`Updating the sale failed: ${error.message}`)
}

export type CostPatch = Partial<
  Pick<Transaction, 'occurred_on' | 'channel' | 'counterparty' | 'amount' | 'shipping_amount' | 'fees_amount' | 'shipping_cost' | 'refund_amount' | 'notes'>
>

/** Bedragen en gegevens van een transactie aanpassen (geen statuswijziging; die gaat via setSaleStatus). */
export async function updateTransaction(id: string, patch: CostPatch): Promise<Transaction> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select(SELECT).single()
  if (error) throw new Error(`Saving failed: ${error.message}`)
  const tx = toTransaction(data)
  if (!tx) throw new Error('Saving failed: unexpected response from the database.')
  return tx
}

// --- Aankoopbewijzen (privé-bucket "receipts") ---

export interface TxDocument {
  id: string
  path: string
  name: string | null
}

export async function listDocuments(transactionId: string): Promise<TxDocument[]> {
  const { data, error } = await supabase
    .from('transaction_documents')
    .select('id, path, name')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Loading documents failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) =>
    isRecord(r) && typeof r.id === 'string' && typeof r.path === 'string' ? [{ id: r.id, path: r.path, name: strOrNull(r.name) }] : [],
  )
}

const MAX_DOC_BYTES = 20 * 1024 * 1024

/** Bewijs (foto of pdf) uploaden; bij een fout wordt het bestand opgeruimd. */
export async function uploadDocument(transactionId: string, file: File): Promise<TxDocument> {
  if (file.size > MAX_DOC_BYTES) throw new Error('This file is too large (max. 20 MB).')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Not signed in.')
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const path = `${auth.user.id}/${transactionId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(RECEIPTS).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (up.error) throw new Error(`Uploading failed: ${up.error.message}`)
  const { data, error } = await supabase
    .from('transaction_documents')
    .insert({ transaction_id: transactionId, path, name: file.name.slice(0, 200) })
    .select('id, path, name')
    .single()
  if (error || !isRecord(data) || typeof data.id !== 'string') {
    await supabase.storage.from(RECEIPTS).remove([path])
    throw new Error(`Saving the document failed: ${error?.message ?? 'unexpected response'}`)
  }
  return { id: data.id, path, name: strOrNull(data.name) }
}

/** Tijdelijke link (10 minuten) om een bewijs te openen. */
export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPTS).createSignedUrl(path, 600)
  if (error || !data) throw new Error(`Opening the document failed: ${error?.message ?? 'no link'}`)
  return data.signedUrl
}

export async function deleteDocument(doc: TxDocument): Promise<void> {
  const { error } = await supabase.from('transaction_documents').delete().eq('id', doc.id)
  if (error) throw new Error(`Deleting failed: ${error.message}`)
  const rm = await supabase.storage.from(RECEIPTS).remove([doc.path])
  if (rm.error) console.warn('Bewijsbestand verwijderen mislukt', rm.error)
}
