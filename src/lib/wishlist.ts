import { DEFAULT_GOAL, type GoalSettings } from './goals'
import { supabase } from './supabase'
import type { Lang } from './tcgdex'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardInput, type CardLanguage, type Condition, type Variant } from './types'

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

let schemaCheck: Promise<boolean> | null = null
let previewGoal: GoalSettings | null = null

/** Alleen voor de ontwerppreview (dev): STAP6 aanwezig doen en een vast doel gebruiken. */
export function overrideGoalForPreview(goal: GoalSettings): void {
  schemaCheck = Promise.resolve(true)
  previewGoal = goal
}

/** True als STAP6 (doelen + wishlist) in de database staat. */
export function hasWishlist(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from('wishlist_items').select('id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /wishlist_items|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

// --- Verzameldoelen ---

/** Opgeslagen doel voor een set; zonder opgeslagen doel de standaard (elke uitvoering, elke taal). */
export async function loadGoal(lang: Lang, setId: string): Promise<GoalSettings> {
  if (previewGoal) return previewGoal
  const { data, error } = await supabase.from('collection_goals').select('*').eq('lang', lang).eq('set_id', setId).maybeSingle()
  if (error) throw new Error(`Loading the goal failed: ${error.message}`)
  if (!isRecord(data)) return DEFAULT_GOAL
  const variants = Array.isArray(data.variants) ? data.variants.flatMap((v: unknown) => oneOf(v, VARIANT_LABELS) ?? []) : []
  const languages = Array.isArray(data.languages) ? data.languages.flatMap((v: unknown) => oneOf(v, LANGUAGE_LABELS) ?? []) : []
  return {
    variants,
    languages,
    includeSecret: data.include_secret !== false,
    includeIncoming: data.include_incoming === true,
    wantedQty: Math.min(99, Math.max(1, Math.trunc(numOrNull(data.wanted_qty) ?? 1))),
  }
}

export async function saveGoal(lang: Lang, setId: string, goal: GoalSettings): Promise<void> {
  const { error } = await supabase.from('collection_goals').upsert(
    {
      lang,
      set_id: setId,
      variants: goal.variants,
      languages: goal.languages,
      include_secret: goal.includeSecret,
      include_incoming: goal.includeIncoming,
      wanted_qty: goal.wantedQty,
    },
    { onConflict: 'user_id,lang,set_id' },
  )
  if (error) throw new Error(`Saving the goal failed: ${error.message}`)
}

// --- Wishlist ---

export interface WishlistItem {
  id: string
  tcgdex_id: string | null
  name: string
  set_code: string | null
  card_number: string | null
  variant: Variant | null
  language: CardLanguage | null
  min_condition: Condition | null
  wanted_qty: number
  max_price: number | null
  /** 1 = hoog, 2 = normaal, 3 = laag. */
  priority: 1 | 2 | 3
  notes: string | null
  created_at: string
}

export type WishlistInput = Omit<WishlistItem, 'id' | 'created_at'>

function toItem(r: unknown): WishlistItem | null {
  if (!isRecord(r) || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  const p = numOrNull(r.priority)
  return {
    id: r.id,
    tcgdex_id: strOrNull(r.tcgdex_id),
    name: r.name,
    set_code: strOrNull(r.set_code),
    card_number: strOrNull(r.card_number),
    variant: oneOf(r.variant, VARIANT_LABELS),
    language: oneOf(r.language, LANGUAGE_LABELS),
    min_condition: oneOf(r.min_condition, CONDITION_LABELS),
    wanted_qty: Math.max(1, Math.trunc(numOrNull(r.wanted_qty) ?? 1)),
    max_price: numOrNull(r.max_price),
    priority: p === 1 || p === 3 ? p : 2,
    notes: strOrNull(r.notes),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
  }
}

export async function listWishlist(): Promise<WishlistItem[]> {
  const { data, error } = await supabase.from('wishlist_items').select('*').order('priority').order('created_at', { ascending: false })
  if (error) throw new Error(`Loading the wishlist failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toItem(r) ?? [])
}

export async function addWishlistItem(input: WishlistInput): Promise<WishlistItem> {
  const { data, error } = await supabase.from('wishlist_items').insert(input).select('*').single()
  if (error) throw new Error(`Adding to the wishlist failed: ${error.message}`)
  const item = toItem(data)
  if (!item) throw new Error('Adding to the wishlist failed: unexpected response.')
  return item
}

export async function updateWishlistItem(id: string, patch: Partial<WishlistInput>): Promise<WishlistItem> {
  const { data, error } = await supabase.from('wishlist_items').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`Saving failed: ${error.message}`)
  const item = toItem(data)
  if (!item) throw new Error('Saving failed: unexpected response.')
  return item
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
  if (error) throw new Error(`Removing failed: ${error.message}`)
}

/**
 * Hoeveel passende exemplaren je al hebt (in bezit of onderweg): zelfde cataloguskaart,
 * en — als opgegeven — dezelfde uitvoering en taal.
 */
export function ownedForWish(item: WishlistItem, cards: readonly CardInput[]): { owned: number; incoming: number } {
  let owned = 0
  let incoming = 0
  if (!item.tcgdex_id) return { owned, incoming }
  for (const c of cards) {
    if (c.tcgdex_id !== item.tcgdex_id) continue
    if (item.variant && c.variant !== item.variant) continue
    if (item.language && c.language !== item.language) continue
    if (c.ownership === 'owned') owned += c.quantity
    else if (c.ownership === 'incoming') incoming += c.quantity
  }
  return { owned, incoming }
}
