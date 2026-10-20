import { useSyncExternalStore } from 'react'
import { compactDataset, type ChsCard, type ChsSet } from './chsData'
import type { ChsWorkerMessage } from './chsWorker'
import type { CardInfo, SetCard, SetSummary } from './tcgdex'

/**
 * Vereenvoudigd-Chinese catalogus op dit apparaat (gekozen 20-10-2026). TCGdex heeft van geen enkele
 * Vereenvoudigd-Chinese set een kaartenlijst; PTCG-CHS-Datasets (github.com/duanxr/PTCG-CHS-Datasets) wel.
 * Voorwaarden van die dataset: alleen niet-commercieel, niet herverspreiden. Daarom staat er geen kopie in de app
 * of op onze server: dit toestel downloadt het bestand zelf (±27 MB, één keer) en bewaart een compacte versie
 * (±2 MB) in IndexedDB. Versie = commit van het bestand, zodat foto's (via jsDelivr) er altijd bij passen.
 * Voor een publieke versie van Dexcrate is een licentie nodig.
 */

const REPO = 'duanxr/PTCG-CHS-Datasets'
const COMMITS_URL = `https://api.github.com/repos/${REPO}/commits?path=ptcg_chs_infos.json&per_page=1`
const rawUrl = (sha: string): string => `https://raw.githubusercontent.com/${REPO}/${sha}/ptcg_chs_infos.json`
const imageUrlFor = (sha: string, path: string): string => `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/${path}`

/** Grootte van het bronbestand (gemeten 20-10-2026), voor de knop. */
export const CHS_DOWNLOAD_MB = 27
/** Zo vaak kijken of er een nieuwere versie is (nieuwe sets). */
const CHECK_EVERY_MS = 14 * 24 * 60 * 60 * 1000

interface Stored {
  v: 1
  sha: string
  fetchedAt: string
  checkedAt: string
  sets: ChsSet[]
}

// --- Opslag (IndexedDB) ---

const DB_NAME = 'dexcrate-catalog'
const STORE = 'chs'
const ENTRY = 'current'

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
    req.onerror = () => reject(req.error ?? new Error('Opening the catalog store failed.'))
  }).catch((err: unknown) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = work(t.objectStore(STORE))
        t.oncomplete = () => resolve(req.result)
        t.onerror = () => reject(t.error ?? new Error('Catalog store transaction failed.'))
        t.onabort = () => reject(t.error ?? new Error('Catalog store transaction aborted.'))
      }),
  )
}

function isStored(v: unknown): v is Stored {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Partial<Stored>
  return s.v === 1 && typeof s.sha === 'string' && typeof s.fetchedAt === 'string' && typeof s.checkedAt === 'string' && Array.isArray(s.sets)
}

async function readStored(): Promise<Stored | null> {
  const v = await tx<unknown>('readonly', (s) => s.get(ENTRY))
  return isStored(v) ? v : null
}

const writeStored = (v: Stored): Promise<unknown> => tx('readwrite', (s) => s.put(v, ENTRY))

// --- Status voor de app ---

export type ChsStatus =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'ready'; fetchedAt: string; cards: number; updateAvailable: boolean }
  | { kind: 'error'; message: string; hasCatalog: boolean }

let status: ChsStatus = { kind: 'loading' }
const listeners = new Set<() => void>()
const readyListeners = new Set<() => void>()

function setStatus(next: ChsStatus): void {
  status = next
  for (const l of listeners) l()
}

const readyStatus = (s: Stored, updateAvailable = false): ChsStatus => ({
  kind: 'ready',
  fetchedAt: s.fetchedAt,
  cards: s.sets.reduce((n, set) => n + set.cards.length, 0),
  updateAvailable,
})

// --- In het geheugen ---

interface Loaded {
  stored: Stored
  /** Set-id in kleine letters → set. */
  byId: Map<string, ChsSet>
}

const toLoaded = (stored: Stored): Loaded => ({ stored, byId: new Map(stored.sets.map((s) => [s.id.toLowerCase(), s])) })

let loaded: Promise<Loaded | null> | null = null

/** Catalogus uit de opslag (één keer per sessie); daarna eventueel op de achtergrond verversen. */
function load(): Promise<Loaded | null> {
  if (loaded) return loaded
  // Geen IndexedDB (tests, oude browser, sommige privévensters): alleen wat deze sessie downloadde, geen melding.
  if (typeof indexedDB === 'undefined') {
    if (status.kind === 'loading') setStatus({ kind: 'none' })
    return Promise.resolve(null)
  }
  loaded ??= readStored()
    .then((s) => {
      if (!s) {
        if (status.kind === 'loading') setStatus({ kind: 'none' })
        return null
      }
      if (status.kind === 'loading') setStatus(readyStatus(s))
      void refreshIfStale(s)
      return toLoaded(s)
    })
    .catch((err: unknown) => {
      console.warn('Chinese catalogus laden mislukt', err)
      if (status.kind === 'loading') setStatus({ kind: 'none' })
      return null
    })
  return loaded
}

// --- Downloaden ---

/** Telefoon op wifi en geen databespaarstand: dan mag 27 MB vanzelf. Onbekend = vragen. */
export function autoDownloadAllowed(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: unknown; saveData?: unknown } }).connection
  return Boolean(c) && c?.saveData !== true && (c?.type === 'wifi' || c?.type === 'ethernet')
}

/** Laatste versie (commit) van het bestand; null als GitHub niet antwoordt (dan "main"). */
async function latestSha(): Promise<string | null> {
  try {
    const res = await fetch(COMMITS_URL)
    if (!res.ok) return null
    const data: unknown = await res.json()
    const sha = Array.isArray(data) && typeof data[0] === 'object' && data[0] !== null ? (data[0] as { sha?: unknown }).sha : null
    return typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) ? sha : null
  } catch (err) {
    console.warn('Versie van de Chinese catalogus opvragen mislukt', err)
    return null
  }
}

/** In een Web Worker (app blijft vloeiend); zonder Worker (tests, oude browser) hier. */
function fetchSets(url: string, onProgress: (loaded: number, total: number) => void): Promise<ChsSet[]> {
  if (typeof Worker === 'undefined') {
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed (${res.status}).`)
        return res.json()
      })
      .then((raw: unknown) => {
        const sets = compactDataset(raw)
        if (sets.length === 0) throw new Error('The catalog file has an unexpected format.')
        return sets
      })
  }
  return new Promise<ChsSet[]>((resolve, reject) => {
    const worker = new Worker(new URL('./chsWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ChsWorkerMessage>) => {
      const m = e.data
      if (m.type === 'progress') onProgress(m.loaded, m.total)
      else {
        worker.terminate()
        if (m.type === 'done') resolve(m.sets)
        else reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Download failed.'))
    }
    worker.postMessage({ url })
  })
}

let running: Promise<void> | null = null

/** Downloaden of bijwerken; dubbel tikken start geen tweede download. */
export function downloadChsCatalog(): Promise<void> {
  running ??= doDownload().finally(() => {
    running = null
  })
  return running
}

async function doDownload(): Promise<void> {
  const before = await load()
  setStatus({ kind: 'downloading', loaded: 0, total: CHS_DOWNLOAD_MB * 1024 * 1024 })
  try {
    const sha = (await latestSha()) ?? 'main'
    const sets = await fetchSets(rawUrl(sha), (l, t) => setStatus({ kind: 'downloading', loaded: l, total: t || CHS_DOWNLOAD_MB * 1024 * 1024 }))
    const now = new Date().toISOString()
    const stored: Stored = { v: 1, sha, fetchedAt: now, checkedAt: now, sets }
    // Opslaan mislukt (bv. geen ruimte): deze sessie toch gebruiken.
    await writeStored(stored).catch((err: unknown) => console.warn('Chinese catalogus bewaren mislukt', err))
    loaded = Promise.resolve(toLoaded(stored))
    setStatus(readyStatus(stored))
    for (const l of readyListeners) l()
  } catch (err) {
    console.error('Chinese catalogus downloaden mislukt', err)
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    setStatus({ kind: 'error', message: offline ? 'No internet connection.' : err instanceof Error ? err.message : 'Download failed.', hasCatalog: before !== null })
    throw err
  }
}

/** Om de 14 dagen kijken of er nieuwe sets zijn; op wifi meteen bijwerken, anders melden in Settings. */
async function refreshIfStale(s: Stored): Promise<void> {
  if (Date.now() - Date.parse(s.checkedAt) < CHECK_EVERY_MS || !navigator.onLine) return
  const sha = await latestSha()
  if (!sha) return
  if (sha === s.sha) {
    const next = { ...s, checkedAt: new Date().toISOString() }
    await writeStored(next).catch((err: unknown) => console.warn('Controle Chinese catalogus bewaren mislukt', err))
    return
  }
  if (autoDownloadAllowed()) await downloadChsCatalog().catch(() => undefined)
  else if (status.kind === 'ready') setStatus({ ...status, updateAvailable: true })
}

/** Weghalen (ruimte vrijmaken). */
export async function removeChsCatalog(): Promise<void> {
  await tx('readwrite', (s) => s.delete(ENTRY))
  loaded = Promise.resolve(null)
  setStatus({ kind: 'none' })
}

/**
 * Er is een Vereenvoudigd-Chinese kaart zonder zekere match: catalogus ophalen als dat mag (wifi).
 * Geeft true als de download (al) loopt of klaar is.
 */
export async function wantChsCatalog(): Promise<boolean> {
  if (await load()) return true
  if (running) return true
  if (!autoDownloadAllowed()) return false
  void downloadChsCatalog().catch(() => undefined)
  return true
}

/** Na een (nieuwe) download, bv. om gescande kaarten opnieuw op te zoeken. */
export function onChsCatalogReady(listener: () => void): () => void {
  readyListeners.add(listener)
  return () => readyListeners.delete(listener)
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  void load()
  return () => listeners.delete(l)
}

export const getChsStatus = (): ChsStatus => status

export function useChsCatalog(): ChsStatus {
  return useSyncExternalStore(subscribe, getChsStatus, getChsStatus)
}

// --- Opzoeken (voor tcgdex.ts) ---

function summaryOf(s: ChsSet): SetSummary {
  return { id: s.id, name: s.name, logo: null, abbr: s.id, total: s.cards.length, official: s.official, releaseDate: s.releaseDate, serieId: null }
}

function setCardOf(sha: string, set: ChsSet, c: ChsCard): SetCard {
  return { id: `${set.id}-${c.localId}`, localId: c.localId, name: c.name, image: c.img ? imageUrlFor(sha, c.img) : null }
}

/** Set (hoofdletterongevoelig: "csv9.5c"), of null als hij er niet is of de catalogus ontbreekt. */
export async function chsSetData(setId: string): Promise<{ summary: SetSummary; cards: SetCard[] } | null> {
  const l = await load()
  const set = l?.byId.get(setId.trim().toLowerCase())
  return l && set ? { summary: summaryOf(set), cards: set.cards.map((c) => setCardOf(l.stored.sha, set, c)) } : null
}

export async function chsSetSummaries(): Promise<SetSummary[]> {
  return (await load())?.stored.sets.map(summaryOf) ?? []
}

export interface ChsSearchFilters {
  type?: string
  rarity?: string
  suffix?: string
}

const MAX_RESULTS = 250

/** Kaarten waarvan de naam de zoekterm bevat (Chinees), optioneel met type, zeldzaamheid of achtervoegsel. */
export async function chsSearch(name: string, filters: ChsSearchFilters = {}): Promise<SetCard[]> {
  const l = await load()
  const q = name.trim().toLowerCase()
  if (!l || (!q && !filters.type && !filters.rarity && !filters.suffix)) return []
  const rarity = filters.rarity?.toLowerCase()
  const suffix = filters.suffix?.toLowerCase()
  const out: SetCard[] = []
  for (const set of l.stored.sets) {
    for (const c of set.cards) {
      const n = c.name.toLowerCase()
      if (q && !n.includes(q)) continue
      if (filters.type && c.type !== filters.type) continue
      if (rarity && c.rarity?.toLowerCase() !== rarity) continue
      if (suffix && !n.endsWith(suffix)) continue
      out.push(setCardOf(l.stored.sha, set, c))
      if (out.length >= MAX_RESULTS) return out
    }
  }
  return out
}

/** "zh-cn/CSV9.5C-062" → set en kaart, of null. */
async function findCard(key: string): Promise<{ l: Loaded; set: ChsSet; card: ChsCard } | null> {
  if (!key.startsWith('zh-cn/')) return null
  const id = key.slice('zh-cn/'.length)
  const dash = id.lastIndexOf('-')
  if (dash < 1) return null
  const l = await load()
  const set = l?.byId.get(id.slice(0, dash).toLowerCase())
  // Alleen de echte schrijfwijze van het set-id: sleutels moeten eenduidig blijven.
  const card = set && set.id === id.slice(0, dash) ? set.cards.find((c) => c.localId === id.slice(dash + 1)) : undefined
  return l && set && card ? { l, set, card } : null
}

/** Staat deze kaart in de Chinese catalogus? (Dan heeft TCGdex er geen gegevens of prijs van.) */
export async function chsHasCard(key: string): Promise<boolean> {
  return (await findCard(key)) !== null
}

export async function chsCardInfo(key: string): Promise<CardInfo | null> {
  const found = await findCard(key)
  if (!found) return null
  const { l, set, card: c } = found
  return {
    key,
    lang: 'zh-cn',
    name: c.name,
    localId: c.localId,
    image: c.img ? imageUrlFor(l.stored.sha, c.img) : null,
    tcgplayerId: null,
    variants: c.variants,
    illustrator: c.illustrator,
    rarity: c.rarity,
    types: c.type ? [c.type] : [],
    suffix: /ex$/i.test(c.name) ? 'ex' : null,
    dexId: c.dexId,
    game: null,
    set: { id: set.id, name: set.name, logo: null },
  }
}
