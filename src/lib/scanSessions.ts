import { supabase } from './supabase'
import { VARIANT_LABELS, type Card, type Variant } from './types'

/** Eén toegevoegde kaart in een scansessie. */
export interface ScanItem {
  card_id: string
  name: string
  set_code: string | null
  card_number: string | null
  tcgdex_id: string | null
  variant: Variant | null
  quantity: number
  /** ISO-tijdstip van toevoegen. */
  at: string
}

export interface ScanSession {
  id: string
  items: ScanItem[]
  created_at: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export function toItem(r: unknown): ScanItem | null {
  if (!isRecord(r) || typeof r.card_id !== 'string' || typeof r.name !== 'string') return null
  return {
    card_id: r.card_id,
    name: r.name,
    set_code: str(r.set_code),
    card_number: str(r.card_number),
    tcgdex_id: str(r.tcgdex_id),
    variant: typeof r.variant === 'string' && r.variant in VARIANT_LABELS ? (r.variant as Variant) : null,
    quantity: typeof r.quantity === 'number' && r.quantity > 0 ? r.quantity : 1,
    at: str(r.at) ?? '',
  }
}

/** Nieuwe kaartregels → sessie-items. */
export function itemsFromRows(rows: readonly Card[], at = new Date().toISOString()): ScanItem[] {
  return rows.map((r) => ({
    card_id: r.id,
    name: r.name,
    set_code: r.set_code,
    card_number: r.card_number,
    tcgdex_id: r.tcgdex_id,
    variant: r.variant,
    quantity: r.quantity,
    at,
  }))
}

/**
 * Al eerder in deze sessie toegevoegd? Zelfde cataloguskaart (en uitvoering als die bekend is),
 * of zonder koppeling: zelfde naam, set en nummer.
 */
export function earlierInSession(
  items: readonly ScanItem[],
  probe: { tcgdex_id: string | null; variant?: Variant | null; name: string; set_code: string | null; card_number: string | null },
): ScanItem | null {
  const same = (i: ScanItem): boolean => {
    if (probe.tcgdex_id) return i.tcgdex_id === probe.tcgdex_id && (!probe.variant || !i.variant || i.variant === probe.variant)
    return (
      i.name.trim().toLowerCase() === probe.name.trim().toLowerCase() &&
      (i.set_code ?? '').toLowerCase() === (probe.set_code ?? '').toLowerCase() &&
      (i.card_number ?? '').replace(/^0+/, '') === (probe.card_number ?? '').replace(/^0+/, '')
    )
  }
  return [...items].reverse().find(same) ?? null
}

let schemaCheck: Promise<boolean> | null = null

/** True als STAP8 (scansessies) in de database staat. */
export function hasScanSessions(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from('scan_sessions').select('id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /scan_sessions|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

/** Lopende (niet afgesloten) sessie, of null. */
export async function openSession(): Promise<ScanSession | null> {
  const { data, error } = await supabase.from('scan_sessions').select('*').is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`Loading the scan session failed: ${error.message}`)
  if (!isRecord(data) || typeof data.id !== 'string') return null
  return {
    id: data.id,
    created_at: typeof data.created_at === 'string' ? data.created_at : '',
    items: Array.isArray(data.items) ? data.items.flatMap((r: unknown) => toItem(r) ?? []) : [],
  }
}

export async function startSession(): Promise<ScanSession> {
  const { data, error } = await supabase.from('scan_sessions').insert({ items: [] }).select('*').single()
  if (error || !isRecord(data) || typeof data.id !== 'string') throw new Error(`Starting a scan session failed: ${error?.message ?? 'unexpected response'}`)
  return { id: data.id, items: [], created_at: typeof data.created_at === 'string' ? data.created_at : '' }
}

export async function saveSessionItems(id: string, items: readonly ScanItem[]): Promise<void> {
  const { error } = await supabase.from('scan_sessions').update({ items }).eq('id', id)
  if (error) throw new Error(`Saving the scan session failed: ${error.message}`)
}

export async function closeSession(id: string): Promise<void> {
  const { error } = await supabase.from('scan_sessions').update({ closed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`Closing the scan session failed: ${error.message}`)
}
