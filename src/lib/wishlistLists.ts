import { supabase } from './supabase'
import { parseWishFilters, type WishFilters } from './wishFilters'

/** 'smart' = opgeslagen filters (STAP10); 'manual' = zelf gekozen wensen (STAP17). */
export type WishlistListKind = 'smart' | 'manual'

/** Lijst op de wishlist: een naam met opgeslagen filters, of met zelf gekozen wensen. */
export interface WishlistList {
  id: string
  name: string
  kind: WishlistListKind
  filters: WishFilters
  sort_order: number
}

const TABLE = 'wishlist_lists'
const ITEMS = 'wishlist_list_items'
/** Alles, zodat het ook werkt vóór STAP17 (zonder kolom kind). */
const LIST_COLUMNS = '*'
export const MAX_LIST_NAME = 60

let schemaCheck: Promise<boolean> | null = null

/** True als STAP10 (slimme lijsten) in de database staat. */
export function hasWishlistLists(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from(TABLE).select('id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /wishlist_lists|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

function toList(r: unknown): WishlistList | null {
  if (typeof r !== 'object' || r === null) return null
  const o = r as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  return {
    id: o.id,
    name: o.name,
    // Zonder STAP17 bestaat de kolom niet: dan is elke lijst slim.
    kind: o.kind === 'manual' ? 'manual' : 'smart',
    filters: parseWishFilters(o.filters),
    sort_order: typeof o.sort_order === 'number' ? o.sort_order : 0,
  }
}

/** Naam controleren: 1 tot 60 tekens, niet dubbel (hoofdletterongevoelig). Fouttekst of null. */
export function listNameError(name: string, existing: readonly WishlistList[], ownId: string | null = null): string | null {
  const n = name.trim()
  if (!n) return 'Enter a name.'
  if (n.length > MAX_LIST_NAME) return `Use at most ${MAX_LIST_NAME} characters.`
  if (existing.some((l) => l.id !== ownId && l.name.trim().toLowerCase() === n.toLowerCase())) return 'A list with this name already exists.'
  return null
}

export async function listWishlistLists(): Promise<WishlistList[]> {
  const { data, error } = await supabase.from(TABLE).select(LIST_COLUMNS).order('sort_order').order('created_at')
  if (error) throw new Error(`Loading your lists failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toList(r) ?? [])
}

export async function addWishlistList(name: string, filters: WishFilters, sortOrder: number, kind: WishlistListKind = 'smart'): Promise<WishlistList> {
  // Kolom kind alleen meesturen bij een eigen lijst (slimme lijsten werken zo ook zonder STAP17).
  const row = { name: name.trim(), filters, sort_order: sortOrder, ...(kind === 'manual' ? { kind } : {}) }
  const { data, error } = await supabase.from(TABLE).insert(row).select(LIST_COLUMNS).single()
  if (error) throw new Error(error.code === '23505' ? 'A list with this name already exists.' : `Saving the list failed: ${error.message}`)
  const list = toList(data)
  if (!list) throw new Error('Saving the list failed: unexpected response.')
  return list
}

export async function updateWishlistList(id: string, patch: { name?: string; filters?: WishFilters }): Promise<WishlistList> {
  const row = { ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.filters ? { filters: patch.filters } : {}) }
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select(LIST_COLUMNS).single()
  if (error) throw new Error(error.code === '23505' ? 'A list with this name already exists.' : `Saving the list failed: ${error.message}`)
  const list = toList(data)
  if (!list) throw new Error('Saving the list failed: unexpected response.')
  return list
}

export async function deleteWishlistList(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(`Removing the list failed: ${error.message}`)
}

let itemsCheck: Promise<boolean> | null = null

/** True als STAP17 (eigen lijsten) in de database staat. */
export function hasManualLists(): Promise<boolean> {
  itemsCheck ??= (async () => {
    const { error } = await supabase.from(ITEMS).select('list_id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /wishlist_list_items|schema cache/i.test(error.message)) return false
    itemsCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return itemsCheck
}

/** Per eigen lijst de wensen erin: lijst-id → wens-ids. */
export type ListMembers = ReadonlyMap<string, ReadonlySet<string>>

export function toMembers(rows: readonly unknown[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue
    const { list_id, item_id } = r as Record<string, unknown>
    if (typeof list_id !== 'string' || typeof item_id !== 'string') continue
    const set = out.get(list_id) ?? new Set<string>()
    set.add(item_id)
    out.set(list_id, set)
  }
  return out
}

export async function listListMembers(): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase.from(ITEMS).select('list_id, item_id')
  if (error) throw new Error(`Loading your lists failed: ${error.message}`)
  return toMembers(data as unknown[])
}

/** Wat er moet gebeuren om een wens in precies deze eigen lijsten te zetten. */
export function listChanges(members: ListMembers, itemId: string, wanted: ReadonlySet<string>, manualIds: readonly string[]): { add: string[]; remove: string[] } {
  const add: string[] = []
  const remove: string[] = []
  for (const id of manualIds) {
    const has = members.get(id)?.has(itemId) ?? false
    if (wanted.has(id) && !has) add.push(id)
    if (!wanted.has(id) && has) remove.push(id)
  }
  return { add, remove }
}

/** Wens in eigen lijsten zetten en/of eruit halen. */
export async function setItemLists(itemId: string, change: { add: readonly string[]; remove: readonly string[] }): Promise<void> {
  if (change.add.length > 0) {
    const { error } = await supabase.from(ITEMS).upsert(
      change.add.map((list_id) => ({ list_id, item_id: itemId })),
      { onConflict: 'list_id,item_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(`Saving the list failed: ${error.message}`)
  }
  if (change.remove.length > 0) {
    const { error } = await supabase.from(ITEMS).delete().eq('item_id', itemId).in('list_id', [...change.remove])
    if (error) throw new Error(`Saving the list failed: ${error.message}`)
  }
}

/** Meerdere wensen tegelijk in één eigen lijst zetten of eruit halen. */
export async function setListItems(listId: string, change: { add: readonly string[]; remove: readonly string[] }): Promise<void> {
  if (change.add.length > 0) {
    const { error } = await supabase.from(ITEMS).upsert(
      change.add.map((item_id) => ({ list_id: listId, item_id })),
      { onConflict: 'list_id,item_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(`Saving the list failed: ${error.message}`)
  }
  if (change.remove.length > 0) {
    const { error } = await supabase.from(ITEMS).delete().eq('list_id', listId).in('item_id', [...change.remove])
    if (error) throw new Error(`Saving the list failed: ${error.message}`)
  }
}
