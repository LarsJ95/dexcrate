import { toPhoto } from './db'
import { supabase } from './supabase'
import type { CardPhoto, PhotoLabel } from './types'

const BUCKET = 'card-photos'
const TABLE = 'card_photos'
const COLUMNS = 'id, card_id, path, thumb_path, label, is_primary, created_at'
/** Weergaveversie: scherp genoeg om in te zoomen. */
const DISPLAY_EDGE = 2000
/** Thumbnail voor overzichten (±30 KB). */
const THUMB_EDGE = 400
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024
/** Ondertekende links zijn een uur geldig; we vernieuwen ruim op tijd. */
const URL_TTL_S = 60 * 60
const URL_REFRESH_MS = 50 * 60 * 1000

interface Resized {
  blob: Blob
  width: number
  height: number
}

async function resize(source: Blob, maxEdge: number, quality: number): Promise<Resized> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This browser cannot read this photo format. Use JPEG, PNG or WebP.')
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process photos.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress the photo.'))), 'image/jpeg', quality),
  )
  return { blob, width: canvas.width, height: canvas.height }
}

/** Foutmelding begrijpelijk maken; ontbrekende tabel of bucket betekent dat STAP4 nog niet gedraaid is. */
export function friendlyPhotoError(message: string): string {
  if (/bucket not found|card_photos|relation .* does not exist|schema cache/i.test(message)) {
    return 'Photo storage is not set up yet (run STAP4 in Supabase).'
  }
  return message
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
}

/** Bestandsextensie voor het origineel; onbekend type → "bin" (wordt dan niet als plaatje geserveerd). */
export function originalExtension(type: string): string {
  return EXTENSIONS[type.toLowerCase()] ?? 'bin'
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in.')
  return data.user.id
}

async function removeFiles(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove([...paths])
  // Een achtergebleven bestand is niet erg; wel loggen.
  if (error) console.warn('Fotobestanden verwijderen mislukt', error)
}

function single(data: unknown, action: string): CardPhoto {
  const photo = toPhoto(data)
  if (!photo) throw new Error(`${action} failed: unexpected response from the database.`)
  return photo
}

export interface UploadOptions {
  /** Kaartregel; null = foto-inbox (later koppelen). */
  cardId: string | null
  label: PhotoLabel
  /** Direct als hoofdfoto instellen (bv. eerste foto van een kaart). */
  makePrimary?: boolean
}

/**
 * Eén foto opslaan: origineel ongewijzigd, plus een weergaveversie en een thumbnail.
 * Mislukt een stap, dan worden al geüploade bestanden opgeruimd.
 */
export async function uploadPhoto(file: Blob, fileName: string | null, opts: UploadOptions): Promise<CardPhoto> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('This photo is too large (max. 25 MB).')
  const uid = await currentUserId()
  const display = await resize(file, DISPLAY_EDGE, 0.88)
  const thumb = await resize(file, THUMB_EDGE, 0.8)
  const id = crypto.randomUUID()
  const files: { path: string; blob: Blob; type: string }[] = [
    { path: `${uid}/${id}.jpg`, blob: display.blob, type: 'image/jpeg' },
    { path: `${uid}/${id}-thumb.jpg`, blob: thumb.blob, type: 'image/jpeg' },
    { path: `${uid}/${id}-original.${originalExtension(file.type)}`, blob: file, type: file.type || 'application/octet-stream' },
  ]
  const uploaded: string[] = []
  try {
    for (const f of files) {
      const { error } = await supabase.storage.from(BUCKET).upload(f.path, f.blob, { contentType: f.type, upsert: false })
      if (error) throw new Error(friendlyPhotoError(`Uploading the photo failed: ${error.message}`))
      uploaded.push(f.path)
    }
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        id,
        card_id: opts.cardId,
        path: files[0].path,
        thumb_path: files[1].path,
        original_path: files[2].path,
        original_name: fileName ? fileName.slice(0, 200) : null,
        label: opts.label,
        is_primary: false,
        width: display.width,
        height: display.height,
        bytes: file.size,
      })
      .select(COLUMNS)
      .single()
    if (error) throw new Error(friendlyPhotoError(`Saving the photo failed: ${error.message}`))
    const photo = single(data, 'Saving the photo')
    return opts.makePrimary && opts.cardId ? await setPrimaryPhoto(photo) : photo
  } catch (err) {
    await removeFiles(uploaded)
    throw err
  }
}

/** Hoofdfoto instellen: eerst de huidige uitzetten (er mag er maar één zijn), dan deze aanzetten. */
export async function setPrimaryPhoto(photo: CardPhoto): Promise<CardPhoto> {
  if (!photo.card_id) throw new Error('Link the photo to a card first.')
  const off = await supabase.from(TABLE).update({ is_primary: false }).eq('card_id', photo.card_id).eq('is_primary', true)
  if (off.error) throw new Error(friendlyPhotoError(`Updating the photo failed: ${off.error.message}`))
  const { data, error } = await supabase.from(TABLE).update({ is_primary: true }).eq('id', photo.id).select(COLUMNS).single()
  if (error) throw new Error(friendlyPhotoError(`Updating the photo failed: ${error.message}`))
  return single(data, 'Updating the photo')
}

/** Label wijzigen of de foto aan een (andere) kaartregel koppelen; null = terug naar de inbox. */
export async function updatePhoto(id: string, patch: { label?: PhotoLabel; card_id?: string | null }): Promise<CardPhoto> {
  // Verplaatsen naar een andere kaart: niet als hoofdfoto meenemen.
  const body = 'card_id' in patch ? { ...patch, is_primary: false } : patch
  const { data, error } = await supabase.from(TABLE).update(body).eq('id', id).select(COLUMNS).single()
  if (error) throw new Error(friendlyPhotoError(`Updating the photo failed: ${error.message}`))
  return single(data, 'Updating the photo')
}

/** Foto definitief verwijderen: eerst de rij, dan de bestanden (origineel, weergave, thumbnail). */
export async function deletePhoto(photo: CardPhoto): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', photo.id).select('original_path')
  if (error) throw new Error(friendlyPhotoError(`Deleting the photo failed: ${error.message}`))
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined
  const original = typeof row?.original_path === 'string' ? row.original_path : null
  await removeFiles([photo.path, photo.thumb_path, original].filter((p): p is string => Boolean(p)))
}

// --- Ondertekende links, gebundeld opgevraagd (één verzoek voor een hele lijst) ---

const urlCache = new Map<string, { url: string; at: number }>()
let pending = new Map<string, ((url: string | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush(): Promise<void> {
  const batch = pending
  pending = new Map()
  timer = null
  const paths = [...batch.keys()]
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_TTL_S)
  if (error) console.warn('Foto-links ophalen mislukt', error)
  const byPath = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl)
  }
  for (const [path, waiters] of batch) {
    const url = byPath.get(path) ?? null
    if (url) urlCache.set(path, { url, at: Date.now() })
    for (const done of waiters) done(url)
  }
}

/** Tijdelijke link naar een eigen foto; null als die niet (meer) bestaat. */
export function getPhotoUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && Date.now() - hit.at < URL_REFRESH_MS) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    const list = pending.get(path) ?? []
    list.push(resolve)
    pending.set(path, list)
    timer ??= setTimeout(() => void flush(), 25)
  })
}
