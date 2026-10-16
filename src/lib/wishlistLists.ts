import { supabase } from './supabase'
import { parseWishFilters, type WishFilters } from './wishFilters'

/** Slimme lijst op de wishlist: een naam met opgeslagen filters (STAP10). */
export interface WishlistList {
  id: string
  name: string
  filters: WishFilters
  sort_order: number
}

const TABLE = 'wishlist_lists'
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
  return { id: o.id, name: o.name, filters: parseWishFilters(o.filters), sort_order: typeof o.sort_order === 'number' ? o.sort_order : 0 }
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
  const { data, error } = await supabase.from(TABLE).select('id, name, filters, sort_order').order('sort_order').order('created_at')
  if (error) throw new Error(`Loading your lists failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toList(r) ?? [])
}

export async function addWishlistList(name: string, filters: WishFilters, sortOrder: number): Promise<WishlistList> {
  const { data, error } = await supabase.from(TABLE).insert({ name: name.trim(), filters, sort_order: sortOrder }).select('id, name, filters, sort_order').single()
  if (error) throw new Error(error.code === '23505' ? 'A list with this name already exists.' : `Saving the list failed: ${error.message}`)
  const list = toList(data)
  if (!list) throw new Error('Saving the list failed: unexpected response.')
  return list
}

export async function updateWishlistList(id: string, patch: { name?: string; filters?: WishFilters }): Promise<WishlistList> {
  const row = { ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.filters ? { filters: patch.filters } : {}) }
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select('id, name, filters, sort_order').single()
  if (error) throw new Error(error.code === '23505' ? 'A list with this name already exists.' : `Saving the list failed: ${error.message}`)
  const list = toList(data)
  if (!list) throw new Error('Saving the list failed: unexpected response.')
  return list
}

export async function deleteWishlistList(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(`Removing the list failed: ${error.message}`)
}
