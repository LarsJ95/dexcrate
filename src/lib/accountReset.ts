import { deletePhotos, listPhotoIds } from './photoStore'
import { supabase } from './supabase'

/**
 * Account resetten (Settings): alles van jou weg, je login blijft.
 * 1. Database: één functie (STAP14) wist al je rijen in één keer (alles of niets).
 * 2. Opslag: je foto's en bonnetjes.
 * 3. Dit toestel: wachtrij, voortgang en "al gevierd"-lijsten. Uiterlijk en scaninstellingen blijven.
 * Opnieuw uitvoeren kan altijd: wat al weg is, wordt overgeslagen.
 */

const BUCKETS = ['card-photos', 'receipts'] as const
const PAGE = 1000
const REMOVE_BATCH = 100

/** Instellingen op dit toestel die bij een reset blijven (uiterlijk en scannen). */
const KEEP_LOCAL = new Set([
  'dexcrate:theme',
  'dexcrate:motion',
  'dexcrate:sky',
  'dexcrate:wallpaper',
  'dexcrate:scan-mode',
  'dexcrate:auto-capture',
  'dexcrate:auto-gap',
  'dexcrate:blur-check',
])

export interface ResetResult {
  /** Aantal gewiste rijen per tabel. */
  rows: Record<string, number>
  filesRemoved: number
  /** Bestanden die niet weg konden; nogmaals resetten probeert ze opnieuw. */
  filesFailed: number
}

/** Alle bestandspaden onder een map, ook in submappen (bonnetjes staan per transactie in een eigen map). */
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`Listing your files failed: ${error.message}`)
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`
      if (entry.id === null) out.push(...(await listAll(bucket, path)))
      else out.push(path)
    }
    if (data.length < PAGE) return out
  }
}

async function removeFiles(userId: string): Promise<{ removed: number; failed: number }> {
  let removed = 0
  let failed = 0
  for (const bucket of BUCKETS) {
    let paths: string[]
    try {
      paths = await listAll(bucket, userId)
    } catch (err) {
      console.warn(`Bestanden in ${bucket} ophalen mislukt`, err)
      failed += 1
      continue
    }
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH)
      const { error } = await supabase.storage.from(bucket).remove(batch)
      if (error) {
        console.warn(`Bestanden in ${bucket} verwijderen mislukt`, error)
        failed += batch.length
      } else removed += batch.length
    }
  }
  return { removed, failed }
}

async function clearDevice(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('dexcrate:') && !KEEP_LOCAL.has(key)) localStorage.removeItem(key)
    }
  } catch (err) {
    console.warn('Gegevens op dit toestel wissen mislukt', err)
  }
  try {
    await deletePhotos(await listPhotoIds())
  } catch (err) {
    console.warn('Bewaarde scanfoto’s wissen mislukt', err)
  }
}

export async function resetAccount(): Promise<ResetResult> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('You need to be signed in to reset your account.')

  const { data, error } = await supabase.rpc('reset_my_account')
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      throw new Error('Resetting is not set up yet: run STAP14 in Supabase first. Nothing was deleted.')
    }
    throw new Error(`Resetting failed: ${error.message}. Nothing was deleted.`)
  }
  const rows: Record<string, number> = {}
  if (typeof data === 'object' && data !== null) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (typeof v === 'number') rows[k] = v
  }

  const files = await removeFiles(auth.user.id)
  await clearDevice()
  return { rows, filesRemoved: files.removed, filesFailed: files.failed }
}
