import { buzz } from './haptics'
import { findCandidates } from './match'
import { deletePhotos, listPhotoIds, loadPhoto, loadQueueData, savePhoto, saveQueueData } from './photoStore'
import { preparedFromBlob, prepareImage, recognizeCards, type PreparedImage } from './scan'
import { BLUR_THRESHOLD, photoSharpness } from './sharpness'
import { MAX_QUEUE, QUEUE_KEY, mergeDuplicate, newItem, parseQueue, withMatch, type QueueItem } from './scanQueue'
import { lookupLang } from './tcgdex'
import { errorText } from './errors'

/**
 * Wachtrij voor snel scannen, buiten React: herkennen loopt door als je even naar een andere pagina gaat.
 * Bewaard op dit apparaat in IndexedDB: de lijst en de foto's (tot ze herkend zijn). Eerder stond de lijst in
 * localStorage (±5 MB voor de hele app); die wordt één keer overgezet.
 * Zonder internet wacht hij en gaat hij verder zodra je weer online bent.
 */

const PARALLEL = 3
const THUMB_EDGE = 220

/** Wegschrijven met een korte vertraging: bij 250 foto's is de lijst een paar MB, en de status wijzigt vaak. */
const SAVE_DELAY_MS = 400

let queue: QueueItem[] = []
const listeners = new Set<() => void>()
/** Foto's die nog herkend moeten worden (of opnieuw kunnen), alleen in het geheugen. */
const images = new Map<string, PreparedImage>()
const running = new Set<string>()

/** Pas na het laden opslaan: anders overschrijft een lege lijst de bewaarde. */
let loaded = false
let saveTimer: number | null = null

async function flush(): Promise<boolean> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    await saveQueueData(JSON.stringify(queue))
    return true
  } catch (err) {
    console.warn('Scan-wachtrij bewaren mislukt', err)
    return false
  }
}

function persist(): void {
  if (!loaded || saveTimer !== null) return
  saveTimer = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
}

/** Bewaarde lijst laden; een oude lijst uit localStorage één keer overzetten en daarna daar weghalen. */
async function loadQueue(): Promise<void> {
  let stored: string | null = null
  try {
    stored = await loadQueueData()
  } catch (err) {
    console.warn('Scan-wachtrij laden mislukt', err)
  }
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(QUEUE_KEY)
  } catch {
    legacy = null // geen opslag beschikbaar
  }
  loaded = true
  const fromStore = parseQueue(stored)
  const fromLegacy = parseQueue(legacy)
  // Oude lijst alleen overnemen als er in IndexedDB nog niets staat.
  const migrate = fromStore.length === 0 && fromLegacy.length > 0
  const items = migrate ? fromLegacy : fromStore
  if (items.length > 0 || queue.length > 0) set([...items, ...queue])
  if (legacy === null) return
  // Oude sleutel weg; bij overzetten pas nadat de lijst echt in IndexedDB staat.
  if (migrate && !(await flush())) return
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch (err) {
    console.warn('Oude scan-wachtrij opruimen mislukt', err)
  }
}

const queueLoaded: Promise<void> = typeof window === 'undefined' ? Promise.resolve() : loadQueue()

function set(next: QueueItem[]): void {
  queue = next
  persist()
  for (const l of listeners) l()
}

const patch = (id: string, p: Partial<QueueItem>): void => set(queue.map((q) => (q.id === id ? { ...q, ...p } : q)))

/** Laatste resultaat, voor directe terugkoppeling in de camera ("Pikachu · 151 #025"). */
export interface ScanFeedback {
  /** Loopt op per melding, zodat dezelfde tekst opnieuw getoond wordt. */
  seq: number
  ok: boolean
  text: string
  /** Ongedaan maken: regel weghalen, of bij een samengevoegde kaart het aantal met 1 verlagen. */
  undo: { kind: 'remove' | 'decrement'; id: string } | null
  /** Wazige foto toch gebruiken. */
  keepAnyway?: () => void
}

let feedback: ScanFeedback | null = null
/** Kaart-sleutels op je wishlist (gezet door de scanpagina). */
let wished: ReadonlySet<string> = new Set()

export function setWishedKeys(keys: ReadonlySet<string>): void {
  wished = keys
}
let feedbackSeq = 0

export const getFeedback = (): ScanFeedback | null => feedback

function announce(f: Omit<ScanFeedback, 'seq'>): void {
  feedbackSeq += 1
  feedback = { ...f, seq: feedbackSeq }
  for (const l of listeners) l()
}

/** Laatste herkenning terugdraaien (vanuit de camera). */
export function undoFeedback(): void {
  const u = feedback?.undo
  feedback = null
  if (!u) {
    for (const l of listeners) l()
    return
  }
  if (u.kind === 'remove') removeItems([u.id])
  else set(queue.map((q) => (q.id === u.id ? { ...q, quantity: Math.max(1, q.quantity - 1) } : q)))
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getQueue = (): QueueItem[] => queue

async function makeThumb(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.7)
}

function dropImage(id: string): void {
  const img = images.get(id)
  if (img) URL.revokeObjectURL(img.previewUrl)
  images.delete(id)
  deletePhotos([id]).catch((err: unknown) => console.warn('Scanfoto opruimen mislukt', err))
}

let restored = false
/** De app wordt gesloten of herladen: afgebroken verzoeken zijn dan geen echte fouten. */
let unloading = false

/** Na herstarten: bewaarde foto's terugladen en verder herkennen; losse foto's zonder regel opruimen. */
async function restore(): Promise<void> {
  await queueLoaded
  try {
    const stored = new Set(await listPhotoIds())
    for (const q of queue) {
      if (q.status === 'ready' || !stored.has(q.id)) continue
      const blob = await loadPhoto(q.id)
      if (blob) images.set(q.id, await preparedFromBlob(blob))
    }
    const known = new Set(queue.map((q) => q.id))
    await deletePhotos([...stored].filter((id) => !known.has(id)))
  } catch (err) {
    console.warn('Bewaarde scanfoto laden mislukt', err)
  }
  const lost = queue.filter((q) => q.status === 'waiting' && !images.has(q.id))
  if (lost.length > 0) {
    const ids = new Set(lost.map((q) => q.id))
    set(queue.map((q) => (ids.has(q.id) ? { ...q, status: 'error', error: 'This photo was not saved on this device. Take it again.' } : q)))
  }
  restored = true
  pump()
}

if (typeof window !== 'undefined') {
  void restore()
  // Weer online: wachtende foto's alsnog herkennen.
  window.addEventListener('online', () => pump())
  window.addEventListener('pagehide', () => {
    unloading = true
    if (saveTimer !== null) void flush()
  })
  // Telefoon: een app op de achtergrond kan zonder waarschuwing worden afgesloten.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer !== null) void flush()
  })
}

/**
 * Foto toevoegen; herkennen start op de achtergrond. Met `checkBlur` (camera) wordt een duidelijk wazige foto
 * niet verstuurd maar gemeld, met de keuze hem toch te gebruiken. Geeft false als hij is tegengehouden.
 */
export async function enqueue(file: File, checkBlur = false): Promise<boolean> {
  await queueLoaded
  if (queue.length >= MAX_QUEUE) throw new Error(`The scan queue is full (${MAX_QUEUE}). Add or clear cards first.`)
  if (checkBlur) {
    const score = await photoSharpness(file).catch((err: unknown) => {
      console.warn('Scherpte meten mislukt', err)
      return Number.POSITIVE_INFINITY
    })
    if (score < BLUR_THRESHOLD) {
      announce({
        ok: false,
        text: 'Blurry photo. Hold still and take it again.',
        undo: null,
        keepAnyway: () => void enqueue(file, false).catch((err: unknown) => console.error('Foto toevoegen mislukt', err)),
      })
      return false
    }
  }
  const img = await prepareImage(file, 'single')
  const thumb = await makeThumb(img.blob)
  const id = crypto.randomUUID()
  images.set(id, img)
  // Ook op het apparaat bewaren, zodat de foto het afsluiten van de app overleeft.
  await savePhoto(id, img.blob).catch((err: unknown) => console.warn('Scanfoto lokaal bewaren mislukt', err))
  // Pas na alle await's de huidige wachtrij lezen: anders gaan foto's die tegelijk binnenkomen verloren.
  set([...queue, newItem(id, thumb)])
  pump()
  return true
}

async function process(id: string): Promise<void> {
  const img = images.get(id)
  if (!img) {
    patch(id, { status: 'error', error: 'This photo is no longer available. Take it again.' })
    return
  }
  try {
    patch(id, { status: 'recognising', error: null })
    const rec = (await recognizeCards(img, 'single')).cards[0]
    if (!rec) {
      patch(id, { status: 'error', error: 'No Pokémon card found. Try again with the card filling the frame.' })
      announce({ ok: false, text: 'No card found. Take it again.', undo: { kind: 'remove', id } })
      return
    }
    patch(id, { status: 'matching', rec })
    const candidates = await findCandidates({ name: rec.nameEnglish, set_code: rec.setCode || null, card_number: rec.cardNumber || null, set_total: rec.setTotal || null }, lookupLang(rec.language)).catch(
      (err: unknown) => {
        console.warn('Kaart opzoeken mislukt', err)
        return []
      },
    )
    // Item kan intussen verwijderd zijn.
    if (!queue.some((q) => q.id === id)) return
    const matched = queue.map((q) => (q.id === id ? withMatch(q, rec, candidates) : q))
    const merged = mergeDuplicate(matched, id)
    set(merged)
    dropImage(id)
    const best = candidates[0]
    const star = best && wished.has(best.key) ? '★ On your wishlist: ' : ''
    const what = best ? `${star}${best.name} · ${best.setName} #${best.localId}` : `${rec.nameEnglish || rec.namePrinted || 'Unknown card'} (no match)`
    // Samengevoegd: de eerdere regel met dezelfde kaart heeft nu een hoger aantal.
    const target = merged.some((q) => q.id === id) ? null : merged.find((q) => q.chosen === best?.key && q.status === 'ready')
    announce({
      ok: Boolean(best) && rec.confidence !== 'low',
      text: target ? `${what} · ${target.quantity}×` : what,
      undo: target ? { kind: 'decrement', id: target.id } : { kind: 'remove', id },
    })
    buzz(15)
  } catch (err) {
    // Afgebroken door sluiten/herladen: niets opslaan, de foto wacht bij de volgende start weer.
    if (unloading) return
    console.error('Scannen mislukt', err)
    // Geen internet: blijven wachten; bij 'online' gaat het vanzelf verder.
    if (!navigator.onLine && queue.some((q) => q.id === id)) {
      patch(id, { status: 'waiting', error: null })
      announce({ ok: false, text: 'Offline. Your photos are kept and recognised when you are back online.', undo: null })
      return
    }
    if (queue.some((q) => q.id === id)) {
      patch(id, { status: 'error', error: errorText(err, 'Recognition failed.') })
      announce({ ok: false, text: 'Recognition failed. You can retry it in the list.', undo: null })
    }
  }
}

/** Wachtende foto's starten, maximaal PARALLEL tegelijk. */
function pump(): void {
  if (!restored || !navigator.onLine) return
  for (const q of queue) {
    if (running.size >= PARALLEL) return
    if (q.status !== 'waiting' || running.has(q.id)) continue
    running.add(q.id)
    void process(q.id).finally(() => {
      running.delete(q.id)
      pump()
    })
  }
}

export const canRetry = (id: string): boolean => images.has(id)

export function retry(id: string): void {
  if (!images.has(id)) return
  patch(id, { status: 'waiting', error: null })
  pump()
}

export function updateItem(id: string, p: Partial<Pick<QueueItem, 'chosen' | 'quantity' | 'variant' | 'include'>>): void {
  const next = queue.map((q) => (q.id === id ? { ...q, ...p } : q))
  // Andere match gekozen die al in de lijst staat: samenvoegen.
  set(p.chosen !== undefined || p.variant !== undefined ? mergeDuplicate(next, id) : next)
}

export function removeItems(ids: readonly string[]): void {
  const drop = new Set(ids)
  for (const id of drop) dropImage(id)
  set(queue.filter((q) => !drop.has(q.id)))
}
