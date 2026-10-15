import { LOCATION_KIND_LABELS, type Location, type PlannedSlot } from './binder'
import { supabase } from './supabase'
import { VARIANT_LABELS, type Variant } from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

function toLocation(r: unknown): Location | null {
  if (!isRecord(r) || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  const kind = typeof r.kind === 'string' && r.kind in LOCATION_KIND_LABELS ? (r.kind as Location['kind']) : 'other'
  return { id: r.id, name: r.name, kind, page_size: intOrNull(r.page_size), sort_order: intOrNull(r.sort_order) ?? 0 }
}

function toPlanned(r: unknown): PlannedSlot | null {
  if (!isRecord(r) || typeof r.id !== 'string' || typeof r.location_id !== 'string' || typeof r.label !== 'string') return null
  const page = intOrNull(r.page)
  const slot = intOrNull(r.slot)
  if (page === null || slot === null) return null
  const variant = typeof r.variant === 'string' && r.variant in VARIANT_LABELS ? (r.variant as Variant) : null
  return { id: r.id, location_id: r.location_id, page, slot, tcgdex_id: typeof r.tcgdex_id === 'string' ? r.tcgdex_id : null, label: r.label, variant }
}

export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase.from('locations').select('*').order('sort_order').order('name')
  if (error) throw new Error(`Loading locations failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toLocation(r) ?? [])
}

export type LocationInput = Pick<Location, 'name' | 'kind' | 'page_size'>

export async function saveLocation(id: string | null, input: LocationInput): Promise<Location> {
  const q = id ? supabase.from('locations').update(input).eq('id', id) : supabase.from('locations').insert(input)
  const { data, error } = await q.select('*').single()
  if (error) throw new Error(`Saving the location failed: ${error.message}`)
  const loc = toLocation(data)
  if (!loc) throw new Error('Saving the location failed: unexpected response.')
  forgetLocations()
  return loc
}

/** Locatie verwijderen: kaarten blijven bestaan, alleen zonder plek; planning verdwijnt mee. */
export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('locations').delete().eq('id', id)
  if (error) throw new Error(`Deleting the location failed: ${error.message}`)
  forgetLocations()
}

let schemaCheck: Promise<boolean> | null = null

/** True als STAP8 (geplande indeling + scansessies) in de database staat. */
export function hasBinderPlanning(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from('binder_slots').select('id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /binder_slots|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

export async function listPlanned(locationId: string): Promise<PlannedSlot[]> {
  const { data, error } = await supabase.from('binder_slots').select('*').eq('location_id', locationId)
  if (error) throw new Error(`Loading the binder plan failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) => toPlanned(r) ?? [])
}

/** Vakje reserveren of de reservering wijzigen (één per vakje). */
export async function savePlanned(input: Omit<PlannedSlot, 'id'>): Promise<PlannedSlot> {
  const { data, error } = await supabase.from('binder_slots').upsert(input, { onConflict: 'location_id,page,slot' }).select('*').single()
  if (error) throw new Error(`Saving the reservation failed: ${error.message}`)
  const p = toPlanned(data)
  if (!p) throw new Error('Saving the reservation failed: unexpected response.')
  return p
}

export async function deletePlanned(id: string): Promise<void> {
  const { error } = await supabase.from('binder_slots').delete().eq('id', id)
  if (error) throw new Error(`Removing the reservation failed: ${error.message}`)
}

let cache: Promise<Location[]> | null = null

/** Locaties, één keer per sessie geladen (opnieuw na wijzigen via `forgetLocations`). */
export function cachedLocations(): Promise<Location[]> {
  cache ??= listLocations().catch((err: unknown) => {
    cache = null
    throw err
  })
  return cache
}

export function forgetLocations(): void {
  cache = null
}
