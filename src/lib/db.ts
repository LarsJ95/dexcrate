import type { SnapshotRow } from './prices'
import { supabase } from './supabase'
import { withOfflineCache } from './offlineCache'
import { fetchAllPages } from './fetchAll'
import {
  AVAILABILITY_LABELS,
  CONDITION_LABELS,
  GRADING_LABELS,
  LANGUAGE_LABELS,
  LINK_STATUS_LABELS,
  OWNERSHIP_LABELS,
  PHOTO_LABELS,
  VARIANT_LABELS,
  EMPTY_CARD,
  deriveStatus,
  fromStatus,
  type Card,
  type CardInput,
  type CardPhoto,
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
  return typeof v === 'string' && Object.hasOwn(allowed, v) ? (v as K) : null
}

const STATUSES: Record<CardStatus, true> = { collection: true, for_sale: true, sold: true }

const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v)
  return n === null ? null : Math.trunc(n)
}

/** Fotorij (card_photos) → object; onverwachte vorm wordt overgeslagen. */
export function toPhoto(r: unknown): CardPhoto | null {
  if (!isRecord(r) || typeof r.id !== 'string' || typeof r.path !== 'string') return null
  return {
    id: r.id,
    card_id: strOrNull(r.card_id),
    path: r.path,
    thumb_path: strOrNull(r.thumb_path),
    label: oneOf(r.label, PHOTO_LABELS) ?? 'other',
    is_primary: r.is_primary === true,
    created_at: str(r.created_at),
  }
}

/** Database-rij → getypeerd object; onverwachte vorm wordt overgeslagen. Rijen van vóór STAP4 krijgen afgeleide waarden. */
export function toCard(r: unknown): Card | null {
  if (!isRecord(r) || typeof r.id !== 'string') return null
  const status = oneOf(r.status, STATUSES) ?? 'collection'
  const derived = fromStatus(status)
  const photos = Array.isArray(r.card_photos) ? r.card_photos.flatMap((p: unknown) => toPhoto(p) ?? []) : []
  photos.sort((a, b) => a.created_at.localeCompare(b.created_at))
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
    status,
    ownership: oneOf(r.ownership, OWNERSHIP_LABELS) ?? derived.ownership,
    availability: oneOf(r.availability, AVAILABILITY_LABELS) ?? derived.availability,
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
    image_path: strOrNull(r.image_path),
    notes: strOrNull(r.notes),
    cert_number: strOrNull(r.cert_number),
    edition: strOrNull(r.edition),
    link_status: oneOf(r.link_status, LINK_STATUS_LABELS),
    cardmarket_id: intOrNull(r.cardmarket_id),
    location_id: strOrNull(r.location_id),
    location_page: intOrNull(r.location_page),
    location_slot: intOrNull(r.location_slot),
    import_batch_id: strOrNull(r.import_batch_id),
    sort_order: Math.trunc(numOrNull(r.sort_order) ?? 0),
    photos,
    split_from: strOrNull(r.split_from),
  }
}

function single(data: unknown): Card {
  const row = toCard(data)
  if (!row) throw new Error('Saving failed: unexpected response from the database.')
  return row
}

// --- Schemaversie: STAP4 gedraaid of niet ---

/** Velden die pas bestaan na STAP4. Zonder STAP4 worden ze niet meegestuurd, zodat opslaan blijft werken. */
export const V2_FIELDS = [
  'ownership',
  'availability',
  'notes',
  'cert_number',
  'edition',
  'link_status',
  'cardmarket_id',
  'location_id',
  'location_page',
  'location_slot',
  'import_batch_id',
] as const satisfies readonly (keyof CardInput)[]

let schemaCheck: Promise<boolean> | null = null

/** Alleen voor de ontwerppreview (dev): schemaversie vastzetten zonder database. */
export function overrideSchemaV2ForPreview(v2: boolean): void {
  schemaCheck = Promise.resolve(v2)
}

/** True als STAP4 in de database staat. Bij een netwerkfout wordt het later opnieuw geprobeerd. */
export function hasSchemaV2(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from(TABLE).select('ownership').limit(1)
    if (!error) return true
    // 42703 = kolom bestaat niet (PostgREST meldt het soms alleen in de tekst).
    if (error.code === '42703' || /ownership/.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

/**
 * Wat naar de database gaat. Status altijd afgeleid van bezit + beschikbaarheid.
 * Vóór STAP4: zonder de nieuwe velden, en image_path alleen als die gevuld is of bewust gewist wordt
 * (de kolom bestaat alleen na STAP3). Sinds STAP4: zonder image_path (foto's staan in card_photos).
 */
export function toRow(input: Partial<CardInput>, v2: boolean): Record<string, unknown> {
  // Alleen kaartvelden: een volledige Card (id, photos, ...) als bron mag geen database-velden meesturen.
  const row: Record<string, unknown> = {}
  for (const key of Object.keys(EMPTY_CARD) as (keyof CardInput)[]) {
    if (key in input) row[key] = input[key]
  }
  if (input.ownership !== undefined && input.availability !== undefined) {
    row.status = deriveStatus(input.ownership, input.availability)
  }
  if (v2) {
    delete row.image_path
    return row
  }
  for (const f of V2_FIELDS) delete row[f]
  const clearingPhoto = Object.keys(input).length === 1 && input.image_path === null
  if (!input.image_path && !clearingPhoto) delete row.image_path
  return row
}

const SELECT_V1 = '*'
const SELECT_V2 = '*, card_photos(id, card_id, path, thumb_path, label, is_primary, created_at)'

/** Alle kaartregels. Zonder internet: de laatst geladen versie van dit apparaat (zie offlineCache). */
export function listCards(): Promise<Card[]> {
  return withOfflineCache(
    'cards',
    async () => {
      const v2 = await hasSchemaV2()
      const { data, error } = await fetchAllPages((from, to) =>
        supabase
          .from(TABLE)
          .select(v2 ? SELECT_V2 : SELECT_V1)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )
      if (error) throw new Error(`Loading failed: ${error.message}`)
      return data
    },
    (data) =>
      (Array.isArray(data) ? data : []).flatMap((r: unknown) => {
        const row = toCard(r)
        return row ? [row] : []
      }),
  )
}

export async function countCards(): Promise<number> {
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Counting failed: ${error.message}`)
  return count ?? 0
}

export async function insertCards(input: readonly CardInput[]): Promise<Card[]> {
  const v2 = await hasSchemaV2()
  // Eén insert-statement: alles of niets.
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input.map((c) => toRow(c, v2)))
    .select(v2 ? SELECT_V2 : SELECT_V1)
  if (error) throw new Error(`Saving failed: ${error.message}`)
  return (data as unknown[]).map(single)
}

export async function insertCard(input: CardInput): Promise<Card> {
  const v2 = await hasSchemaV2()
  const { data, error } = await supabase.from(TABLE).insert(toRow(input, v2)).select(v2 ? SELECT_V2 : SELECT_V1).single()
  if (error) throw new Error(`Saving failed: ${error.message}`)
  return single(data)
}

export async function updateCard(id: string, patch: Partial<CardInput>): Promise<Card> {
  const v2 = await hasSchemaV2()
  const { data, error } = await supabase
    .from(TABLE)
    .update(toRow(patch, v2))
    .eq('id', id)
    .select(v2 ? SELECT_V2 : SELECT_V1)
    .single()
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
    // Per blok in pagina's, anders vallen de nieuwste dagen weg. Volgorde = primaire sleutel.
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
        .from('price_snapshots')
        .select('tcgdex_id, taken_on, trend, trend_holo')
        .in('tcgdex_id', chunk)
        .order('taken_on', { ascending: true })
        .order('tcgdex_id', { ascending: true })
        .range(from, to),
    )
    if (error) throw new Error(`Loading value history failed: ${error.message}`)
    for (const r of data) {
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
