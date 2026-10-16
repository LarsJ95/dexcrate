/**
 * Scanfoto's op dit apparaat bewaren (IndexedDB) tot ze herkend zijn, zodat ze het afsluiten van de app overleven.
 * Zonder IndexedDB (privévenster, oude browser) faalt alles netjes; de aanroeper vangt dat af.
 */

const DB_NAME = 'dexcrate-scan'
const STORE = 'photos'

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
    req.onerror = () => reject(req.error ?? new Error('Opening the photo store failed.'))
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
        tx.onerror = () => reject(tx.error ?? new Error('Photo store transaction failed.'))
        tx.onabort = () => reject(tx.error ?? new Error('Photo store transaction aborted.'))
      }),
  )
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  await run('readwrite', (s) => s.put(blob, id))
}

export async function loadPhoto(id: string): Promise<Blob | null> {
  const v = await run<unknown>('readonly', (s) => s.get(id))
  return v instanceof Blob ? v : null
}

export async function deletePhotos(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await run('readwrite', (s) => {
    for (const id of ids) s.delete(id)
    return null
  })
}

export async function listPhotoIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return (keys ?? []).filter((k): k is string => typeof k === 'string')
}
