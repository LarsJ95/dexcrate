import { updateCard } from './db'
import { supabase } from './supabase'
import type { Card } from './types'

const BUCKET = 'card-photos'
/** Klein genoeg voor snelle lijsten (±100 KB), groot genoeg om de kaart te herkennen. */
const MAX_EDGE = 900
/** Ondertekende links zijn een uur geldig; we vernieuwen ruim op tijd. */
const URL_TTL_S = 60 * 60
const URL_REFRESH_MS = 50 * 60 * 1000

async function shrink(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process photos.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress the photo.'))), 'image/jpeg', 0.85),
  )
}

function friendly(message: string): string {
  // Bucket of kolom bestaat nog niet: STAP3 is niet gedraaid.
  if (/bucket not found|image_path/i.test(message)) return 'Photo storage is not set up yet (run STAP3 in Supabase).'
  return message
}

/** Slaat een foto op als eigen afbeelding van de kaart en geeft de bijgewerkte kaart terug. */
export async function setCardPhoto(card: Card, photo: Blob): Promise<Card> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Not signed in.')
  const blob = await shrink(photo)
  const path = `${auth.user.id}/${card.id}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(friendly(`Uploading the photo failed: ${error.message}`))
  let updated: Card
  try {
    updated = await updateCard(card.id, { image_path: path })
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(friendly(err instanceof Error ? err.message : 'Saving the photo failed.'))
  }
  if (card.image_path) await removeFile(card.image_path)
  return updated
}

/** Verwijdert de eigen foto van een kaart. */
export async function clearCardPhoto(card: Card): Promise<Card> {
  const updated = await updateCard(card.id, { image_path: null })
  if (card.image_path) await removeFile(card.image_path)
  return updated
}

async function removeFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  // Een achtergebleven bestand is niet erg; wel loggen.
  if (error) console.warn('Oude foto verwijderen mislukt', error)
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
