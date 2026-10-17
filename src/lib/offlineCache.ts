import { useSyncExternalStore } from 'react'
import { isNetworkError } from './errors'
import { supabase } from './supabase'

/**
 * Laatst geladen gegevens (collectie, wishlist) op dit apparaat bewaren, zodat je ze zonder internet nog kunt
 * bekijken. Per gebruiker; bij uitloggen gewist. Zonder IndexedDB (privévenster) werkt alles gewoon online.
 */

const DB_NAME = 'dexcrate-cache'
const STORE = 'data'

interface Entry {
  savedAt: number
  value: unknown
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Opening the offline cache failed.'))
  }).catch((err: unknown) => {
    dbPromise = null // volgende keer opnieuw proberen
    throw err
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = work(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : null)
        tx.onerror = () => reject(tx.error ?? new Error('Offline cache transaction failed.'))
        tx.onabort = () => reject(tx.error ?? new Error('Offline cache transaction aborted.'))
      }),
  )
}

const isEntry = (v: unknown): v is Entry => typeof v === 'object' && v !== null && typeof (v as Entry).savedAt === 'number' && 'value' in v

/** Alles wissen (uitloggen, account resetten). */
export async function clearOfflineCache(): Promise<void> {
  stale.clear()
  emit()
  await run('readwrite', (s) => s.clear())
}

// --- Welke getoonde gegevens komen uit de cache (en van wanneer)? ---

const stale = new Map<string, number>()
const listeners = new Set<() => void>()
let snapshot: number | null = null

function emit(): void {
  snapshot = stale.size === 0 ? null : Math.min(...stale.values())
  for (const l of listeners) l()
}

/** Tijdstip (ms) van de oudste bewaarde gegevens die nu getoond worden, of null als alles actueel is. */
export function useOfflineDataTime(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}

async function userKey(name: string): Promise<string | null> {
  // getSession leest de sessie van dit apparaat (werkt offline).
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  return id ? `${id}:${name}` : null
}

/**
 * Gegevens ophalen; gelukt → ook bewaren. Mislukt door geen verbinding → de laatst bewaarde versie
 * (die gaat dan opnieuw door `parse`). Andere fouten, of niets bewaard: de fout gewoon doorgeven.
 */
export async function withOfflineCache<T>(name: string, fetchRaw: () => Promise<unknown>, parse: (raw: unknown) => T): Promise<T> {
  const key = await userKey(name).catch(() => null)
  // Zeker offline: meteen de bewaarde versie (Supabase probeert anders eerst 1 + 2 + 4 s opnieuw per verzoek).
  if (key && typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await readCached(key, parse)
    if (cached !== undefined) return cached
  }
  try {
    const raw = await fetchRaw()
    const value = parse(raw)
    if (key) {
      run('readwrite', (s) => s.put({ savedAt: Date.now(), value: raw } satisfies Entry, key)).catch((err: unknown) => console.warn('Offline bewaren mislukt', err))
      if (stale.delete(key)) emit()
    }
    return value
  } catch (err) {
    if (!key || !isNetworkError(err)) throw err
    const cached = await readCached(key, parse)
    if (cached === undefined) throw err
    return cached
  }
}

/** Bewaarde versie (en melden dat die getoond wordt), of undefined als er niets bewaard is. */
async function readCached<T>(key: string, parse: (raw: unknown) => T): Promise<T | undefined> {
  const entry = await run<unknown>('readonly', (s) => s.get(key)).catch(() => null)
  if (!isEntry(entry)) return undefined
  stale.set(key, entry.savedAt)
  emit()
  return parse(entry.value)
}
