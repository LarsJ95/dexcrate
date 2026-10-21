import { supabase } from './supabase'
import { CONDITION_LABELS, LANGUAGE_LABELS, type CardLanguage, type Condition } from './types'
import { EMPTY_SETTINGS, type UserSettings } from './valuation'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

let schemaCheck: Promise<boolean> | null = null

/** Alleen voor de ontwerppreview (dev). */
export function overrideValuationsForPreview(v: boolean): void {
  schemaCheck = Promise.resolve(v)
}

/** True als STAP7 (waarderingen + instellingen) in de database staat. */
export function hasValuations(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from('valuations').select('id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /valuations|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

// --- Handmatige waarderingen ---

export interface Valuation {
  id: string
  card_id: string
  /** Per stuk, euro. */
  amount: number
  valued_on: string
  note: string | null
}

function toValuation(r: unknown): Valuation | null {
  if (!isRecord(r) || typeof r.id !== 'string' || typeof r.card_id !== 'string') return null
  const amount = numOrNull(r.amount)
  if (amount === null || typeof r.valued_on !== 'string') return null
  return { id: r.id, card_id: r.card_id, amount, valued_on: r.valued_on, note: typeof r.note === 'string' && r.note ? r.note : null }
}

/** Alle waarderingen (of die van één kaartregel), nieuwste eerst. */
export async function listValuations(cardId?: string): Promise<Valuation[]> {
  let q = supabase.from('valuations').select('id, card_id, amount, valued_on, note').order('valued_on', { ascending: false }).order('created_at', { ascending: false })
  if (cardId) q = q.eq('card_id', cardId)
  const { data, error } = await q
  if (error) throw new Error(`Loading valuations failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toValuation(r) ?? [])
}

export async function addValuation(input: Omit<Valuation, 'id'>): Promise<Valuation> {
  const { data, error } = await supabase.from('valuations').insert(input).select('id, card_id, amount, valued_on, note').single()
  if (error) throw new Error(`Saving the valuation failed: ${error.message}`)
  const v = toValuation(data)
  if (!v) throw new Error('Saving the valuation failed: unexpected response.')
  return v
}

export async function deleteValuation(id: string): Promise<void> {
  const { error } = await supabase.from('valuations').delete().eq('id', id)
  if (error) throw new Error(`Deleting failed: ${error.message}`)
}

/** Nieuwste waardering per kaartregel. */
export function latestByCard(valuations: readonly Valuation[]): Map<string, Valuation> {
  const map = new Map<string, Valuation>()
  for (const v of valuations) {
    const cur = map.get(v.card_id)
    if (!cur || v.valued_on > cur.valued_on) map.set(v.card_id, v)
  }
  return map
}

// --- Instellingen ---

export function parseSettings(raw: unknown): UserSettings {
  if (!isRecord(raw)) return EMPTY_SETTINGS
  const pct: Partial<Record<Condition, number>> = {}
  if (isRecord(raw.condition_pct)) {
    for (const [k, v] of Object.entries(raw.condition_pct)) {
      const n = numOrNull(v)
      if (Object.hasOwn(CONDITION_LABELS, k) && n !== null && n >= 0 && n <= 200) pct[k as Condition] = n
    }
  }
  const fee = numOrNull(raw.sale_fee_pct)
  const cost = numOrNull(raw.sale_cost_per_sale)
  const d = isRecord(raw.defaults) ? raw.defaults : {}
  return {
    conditionPct: pct,
    saleFeePct: fee !== null && fee >= 0 && fee < 100 ? fee : null,
    saleCostPerSale: cost !== null && cost >= 0 ? cost : null,
    defaults: {
      language: typeof d.language === 'string' && Object.hasOwn(LANGUAGE_LABELS, d.language) ? (d.language as CardLanguage) : null,
      condition: typeof d.condition === 'string' && Object.hasOwn(CONDITION_LABELS, d.condition) ? (d.condition as Condition) : null,
      set_code: typeof d.set_code === 'string' && d.set_code.trim() ? d.set_code.trim().slice(0, 20) : null,
      location_id: typeof d.location_id === 'string' && d.location_id ? d.location_id : null,
    },
  }
}

let settingsCache: Promise<UserSettings> | null = null

export function loadSettings(): Promise<UserSettings> {
  settingsCache ??= (async () => {
    const { data, error } = await supabase.from('user_settings').select('settings').maybeSingle()
    if (error) {
      settingsCache = null
      throw new Error(`Loading settings failed: ${error.message}`)
    }
    return parseSettings(isRecord(data) ? data.settings : null)
  })()
  return settingsCache
}

/**
 * Een deel van je instellingen opslaan; de rest blijft staan (21-10-2026: ook vastgezette sets staan hierin, die mogen
 * niet verdwijnen als je waarde-instellingen opslaat en andersom). Eerst de actuele stand lezen, dan samenvoegen.
 */
export async function patchSettings(patch: Record<string, unknown>): Promise<void> {
  const { data, error: readError } = await supabase.from('user_settings').select('settings').maybeSingle()
  if (readError) throw new Error(`Saving settings failed: ${readError.message}`)
  const current = isRecord(data) && isRecord(data.settings) ? data.settings : {}
  const { error } = await supabase.from('user_settings').upsert({ settings: { ...current, ...patch } }, { onConflict: 'user_id' })
  if (error) throw new Error(`Saving settings failed: ${error.message}`)
}

export async function saveSettings(s: UserSettings): Promise<void> {
  await patchSettings({ condition_pct: s.conditionPct, sale_fee_pct: s.saleFeePct, sale_cost_per_sale: s.saleCostPerSale, defaults: s.defaults })
  settingsCache = Promise.resolve(s)
}
