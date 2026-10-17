/**
 * Snel scannen op dit apparaat bewaren (IndexedDB): de foto's tot ze herkend zijn, en de lijst zelf, zodat beide
 * het afsluiten van de app overleven. IndexedDB heeft veel meer ruimte dan localStorage (honderden MB's).
 * Zonder IndexedDB (privévenster, oude browser) faalt alles netjes; de aanroeper vangt dat af.
 */

const DB_NAME = 'dexcrate-scan'
// v2 (17-10-2026): opslagvak 'queue' voor de lijst erbij (stond in localStorage).
const DB_VERSION = 2
const PHOTOS = 'photos'
const QUEUE = 'queue'
const QUEUE_ID = 'current'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const name of [PHOTOS, QUEUE]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Opening the photo store failed.'))
  }).catch((err: unknown) => {
    dbPromise = null // volgende keer opnieuw proberen
    throw err
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = work(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : null)
        tx.onerror = () => reject(tx.error ?? new Error('Photo store transaction failed.'))
        tx.onabort = () => reject(tx.error ?? new Error('Photo store transaction aborted.'))
      }),
  )
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  await run(PHOTOS, 'readwrite', (s) => s.put(blob, id))
}

export async function loadPhoto(id: string): Promise<Blob | null> {
  const v = await run<unknown>(PHOTOS, 'readonly', (s) => s.get(id))
  return v instanceof Blob ? v : null
}

export async function deletePhotos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await run(PHOTOS, 'readwrite', (s) => {
    for (const id of ids) s.delete(id)
    return null
  })
}

export async function listPhotoIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(PHOTOS, 'readonly', (s) => s.getAllKeys())
  return (keys ?? []).filter((k): k is string => typeof k === 'string')
}

/** De lijst van snel scannen als JSON-tekst; null = niets bewaard. */
export async function loadQueueData(): Promise<string | null> {
  const v = await run<unknown>(QUEUE, 'readonly', (s) => s.get(QUEUE_ID))
  return typeof v === 'string' ? v : null
}

export async function saveQueueData(json: string): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.put(json, QUEUE_ID))
}

export async function clearQueueData(): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.clear())
}
