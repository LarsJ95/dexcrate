import { clearOfflineCache } from './offlineCache'
import { clearQueueData, deletePhotos, listPhotoIds } from './photoStore'
import { supabase } from './supabase'

/**
 * Account resetten (Settings): alles van jou weg, je login blijft.
 * 1. Database: één functie (STAP14) wist al je rijen in één keer (alles of niets).
 * 2. Opslag: je foto's en bonnetjes.
 * 3. Dit toestel: wachtrij, voortgang, "al gevierd"-lijsten en offline bewaarde gegevens. Uiterlijk en scaninstellingen blijven.
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
    await clearQueueData()
  } catch (err) {
    console.warn('Bewaarde scanfoto’s en scanlijst wissen mislukt', err)
  }
  try {
    await clearOfflineCache()
  } catch (err) {
    console.warn('Offline bewaarde gegevens wissen mislukt', err)
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

/**
 * Account helemaal verwijderen (Settings → Account, AVG; 24-10-2026): eerst alles wissen zoals "Reset account"
 * (gegevens, bestanden, dit toestel), dan het inlogaccount (STAP29, bevestigd met je e-mailadres) en uitloggen.
 * Lukt het wissen van bestanden niet helemaal, dan stopt het vóór het account weg is: opnieuw proberen kan.
 */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  const r = await resetAccount()
  if (r.filesFailed > 0) throw new Error(`${r.filesFailed} files could not be removed, so your account was not deleted yet. Try again.`)
  const { error } = await supabase.rpc('delete_my_account', { p_confirm_email: confirmEmail.trim() })
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new Error('Deleting accounts is not available yet. Your data was deleted.')
    throw new Error(`Deleting the account failed: ${error.message}`)
  }
  // Het account bestaat niet meer; de sessie op dit toestel opruimen (fout negeren: het account is al weg).
  await supabase.auth.signOut({ scope: 'local' }).catch((err: unknown) => console.warn('Uitloggen na verwijderen mislukt', err))
}
