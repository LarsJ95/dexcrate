import { fetchAllPages } from './fetchAll'
import { supabase } from './supabase'

/** Zoveel id's per verzoek: ze staan in de URL, en die mag niet te lang worden. */
const ID_CHUNK = 100

export interface ImportBatch {
  id: string
  source: string
  file_name: string | null
  file_hash: string | null
  row_count: number
  created_at: string
  reverted_at: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function toBatch(r: unknown): ImportBatch | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  return {
    id: r.id,
    source: typeof r.source === 'string' ? r.source : '',
    file_name: typeof r.file_name === 'string' ? r.file_name : null,
    file_hash: typeof r.file_hash === 'string' ? r.file_hash : null,
    row_count: typeof r.row_count === 'number' ? r.row_count : 0,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    reverted_at: typeof r.reverted_at === 'string' ? r.reverted_at : null,
  }
}

/** SHA-256 van een bestand (hex), om dezelfde import te herkennen. */
export async function fileHash(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listBatches(): Promise<ImportBatch[]> {
  const { data, error } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error(`Loading imports failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toBatch(r) ?? [])
}

export async function createBatch(input: Pick<ImportBatch, 'source' | 'file_name' | 'file_hash' | 'row_count'>): Promise<ImportBatch> {
  const { data, error } = await supabase.from('import_batches').insert(input).select('*').single()
  if (error) throw new Error(`Saving the import failed: ${error.message}`)
  const batch = toBatch(data)
  if (!batch) throw new Error('Saving the import failed: unexpected response.')
  return batch
}

/** Batch zonder kaarten (import mislukt) weer opruimen. */
export async function deleteBatch(id: string): Promise<void> {
  const { error } = await supabase.from('import_batches').delete().eq('id', id)
  if (error) console.warn('Lege importbatch opruimen mislukt', error)
}

/**
 * Import terugdraaien: kaarten uit deze import verwijderen, behalve kaarten die inmiddels in een
 * aankoop of verkoop staan of niet meer in bezit zijn (die horen bij je administratie en blijven staan).
 */
export async function undoBatch(id: string): Promise<{ deleted: number; kept: number }> {
  // Eerst alles ophalen, pas daarna verwijderen: pagineren over een lijst die krimpt slaat rijen over.
  const { data, error } = await fetchAllPages((from, to) =>
    supabase.from('cards').select('id, ownership').eq('import_batch_id', id).order('id', { ascending: true }).range(from, to),
  )
  if (error) throw new Error(`Undo failed: ${error.message}`)
  const rows = data.filter(isRecord)
  const ids = rows.map((r) => String(r.id))
  const inTransactions = await cardsInTransactions(ids)
  const removable = rows.filter((r) => !inTransactions.has(String(r.id)) && (r.ownership === 'owned' || r.ownership === 'incoming')).map((r) => String(r.id))
  for (let i = 0; i < removable.length; i += ID_CHUNK) {
    const del = await supabase.from('cards').delete().in('id', removable.slice(i, i + ID_CHUNK))
    if (del.error) throw new Error(`Undo failed: ${del.error.message}`)
  }
  const upd = await supabase.from('import_batches').update({ reverted_at: new Date().toISOString() }).eq('id', id)
  if (upd.error) throw new Error(`Undo failed: ${upd.error.message}`)
  return { deleted: removable.length, kept: rows.length - removable.length }
}

/**
 * Kaarten die in een aan- of verkoop staan. Moet volledig zijn: een gemiste regel betekent dat undo een kaart uit je
 * administratie verwijdert. Bestaat de tabel niet (STAP5 niet gedraaid), dan zijn er ook geen transacties.
 */
async function cardsInTransactions(ids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    const { data, error } = await fetchAllPages((from, to) =>
      supabase.from('transaction_lines').select('card_id').in('card_id', chunk).order('id', { ascending: true }).range(from, to),
    )
    if (error) {
      // Alleen bij het eerste verzoek: verdwijnt de tabel halverwege, dan liever een fout dan een halve lijst.
      if (i === 0 && /schema cache|does not exist/i.test(error.message)) return found
      throw new Error(`Undo failed: ${error.message}`)
    }
    for (const r of data) if (isRecord(r) && typeof r.card_id === 'string') found.add(r.card_id)
  }
  return found
}
