import { buzz } from './haptics'
import { autoPick } from './match'
import { scanCandidates } from './scanMemory'
import { deletePhotos, listPhotoIds, loadPhoto, loadQueueData, savePhoto, saveQueueData } from './photoStore'
import { preparedFromBlob, prepareImage, recognizeCards, type PreparedImage, type Recognition } from './scan'
import { BLUR_THRESHOLD, photoSharpness } from './sharpness'
import { MATCHER_VERSION, MAX_QUEUE, QUEUE_KEY, isOutdated, mergeDuplicate, needsRematch, newItem, parseQueue, rematchAfterChs, withMatch, type QueueItem } from './scanQueue'
import { onChsCatalogReady } from './chsCatalog'
import { errorText } from './errors'
import { variantFacts } from './variantChoice'

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
/** Regels waarvan de foto op het apparaat staat (IndexedDB): nodig voor "Look again". Weg bij toevoegen of verwijderen. */
const storedPhotos = new Set<string>()
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

/** Foto uit het geheugen halen; op het apparaat blijft hij (voor "Look again"). */
function releaseImage(id: string): void {
  const img = images.get(id)
  if (img) URL.revokeObjectURL(img.previewUrl)
  images.delete(id)
}

/** Foto helemaal weg: geheugen en apparaat. */
function dropImage(id: string): void {
  releaseImage(id)
  storedPhotos.delete(id)
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
    for (const id of stored) if (known.has(id)) storedPhotos.add(id)
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
  void rematchOutdated()
}

/**
 * Het opzoeken is verbeterd sinds deze regels herkend werden: opnieuw opzoeken met wat de scan las (geen nieuwe
 * scan, kost niets). Regels waar je zelf een andere kaart koos blijven zoals ze zijn. Mislukt het (offline), dan
 * bij de volgende start opnieuw.
 */
async function rematchOutdated(): Promise<void> {
  if (!navigator.onLine) return
  await rematch(needsRematch)
  const kept = new Set(queue.filter((q) => isOutdated(q) && !needsRematch(q)).map((q) => q.id))
  if (kept.size > 0) set(queue.map((q) => (kept.has(q.id) ? { ...q, matcher: MATCHER_VERSION } : q)))
}

async function rematch(which: (q: QueueItem) => boolean): Promise<void> {
  for (const q of queue.filter(which)) {
    if (!q.rec) continue
    await applyMatch(q.id, q.rec).catch((err: unknown) => console.warn('Opnieuw opzoeken mislukt', err))
  }
}

// Chinese catalogus net binnen: Chinese regels zonder eigen keuze opnieuw opzoeken (geen nieuwe scan).
if (typeof window !== 'undefined') onChsCatalogReady(() => void queueLoaded.then(() => rematch(rematchAfterChs)))

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
  // Ook op het apparaat bewaren, zodat de foto het afsluiten van de app overleeft (en voor "Look again").
  await savePhoto(id, img.blob)
    .then(() => storedPhotos.add(id))
    .catch((err: unknown) => console.warn('Scanfoto lokaal bewaren mislukt', err))
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
    const candidates = await scanCandidates(rec).catch(
      (err: unknown) => {
        console.warn('Kaart opzoeken mislukt', err)
        return []
      },
    )
    const facts = await variantFacts(autoPick(candidates)?.key)
    // Item kan intussen verwijderd zijn.
    if (!queue.some((q) => q.id === id)) return
    const matched = queue.map((q) => (q.id === id ? withMatch(q, rec, candidates, facts) : q))
    const merged = mergeDuplicate(matched, id)
    set(merged)
    // Samengevoegd met een eerdere regel: foto niet meer nodig. Anders alleen uit het geheugen (bewaard voor "Look again").
    if (merged.some((q) => q.id === id)) releaseImage(id)
    else dropImage(id)
    const best = autoPick(candidates)
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

/**
 * Opnieuw zoeken met door jou gecorrigeerde gelezen waarden (geen nieuwe scan). De regel blijft staan tot er
 * een antwoord is; mislukt het zoeken, dan blijft alles zoals het was en krijg je de fout.
 */
export async function searchAgain(id: string, rec: Recognition): Promise<void> {
  if (!queue.some((q) => q.id === id && q.status === 'ready')) return
  await applyMatch(id, rec)
}

/** Kandidaten en uitvoeringen zoeken en in de regel zetten; samengevoegd met een eerdere regel → foto weg. */
async function applyMatch(id: string, rec: Recognition): Promise<void> {
  const candidates = await scanCandidates(rec)
  const facts = await variantFacts(autoPick(candidates)?.key)
  // Item kan intussen verwijderd zijn.
  if (!queue.some((q) => q.id === id)) return
  const merged = mergeDuplicate(queue.map((q) => (q.id === id ? withMatch(q, rec, candidates, facts) : q)), id)
  set(merged)
  if (!merged.some((q) => q.id === id)) dropImage(id)
}

/** Kan deze regel nog eens bekeken worden? (De foto staat nog op het apparaat of in het geheugen.) */
export const canLookAgain = (id: string): boolean => storedPhotos.has(id) || images.has(id)

/**
 * "Look again": dezelfde foto nog één keer laten lezen door het sterkere model (kost meer dan een gewone scan).
 * De regel blijft staan tot er een antwoord is; mislukt het, dan blijft alles zoals het was en krijg je de fout.
 */
export async function lookAgain(id: string): Promise<void> {
  if (!queue.some((q) => q.id === id && q.status === 'ready')) return
  let img = images.get(id) ?? null
  // Alleen voor deze ene keer uit de opslag geladen: daarna weer loslaten.
  let temporary = false
  if (!img) {
    const blob = await loadPhoto(id)
    if (!blob) throw new Error('The photo of this scan is no longer on this device. Take it again.')
    img = await preparedFromBlob(blob)
    temporary = true
  }
  try {
    const rec = (await recognizeCards(img, 'single', { strong: true })).cards[0]
    if (!rec) throw new Error('No Pokémon card found, also on a second look. Take the photo again.')
    await applyMatch(id, rec)
  } finally {
    if (temporary) URL.revokeObjectURL(img.previewUrl)
  }
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

// --- Weghalen met "Undo" (audit G1, 20-10-2026) ---

/** Zo lang kun je een weggehaalde scan terughalen; pas daarna wordt de foto gewist. */
export const UNDO_MS = 5000

/** Wat er net is weggehaald, voor de melding "Removed … · Undo". */
export interface RemovedInfo {
  count: number
  label: string
}

let removed: { items: { item: QueueItem; index: number }[]; timer: number } | null = null
let removedInfo: RemovedInfo | null = null

export const getRemoved = (): RemovedInfo | null => removedInfo

const itemLabel = (q: QueueItem): string => q.rec?.nameEnglish || q.rec?.namePrinted || 'Photo'

/** Regels weghalen met de mogelijkheid om terug te halen; foto's blijven tot UNDO_MS voorbij is. */
export function removeWithUndo(ids: readonly string[]): void {
  finishRemove()
  const drop = new Set(ids)
  const items = queue.flatMap((item, index) => (drop.has(item.id) ? [{ item, index }] : []))
  if (items.length === 0) return
  removed = { items, timer: window.setTimeout(finishRemove, UNDO_MS) }
  removedInfo = { count: items.length, label: itemLabel(items[0].item) }
  set(queue.filter((q) => !drop.has(q.id)))
}

/** Tijd voorbij (of een nieuwe verwijdering): nu echt wissen, ook de foto's. */
function finishRemove(): void {
  if (!removed) return
  window.clearTimeout(removed.timer)
  for (const { item } of removed.items) dropImage(item.id)
  removed = null
  removedInfo = null
  for (const l of listeners) l()
}

/** Terughalen op de oude plek. Een regel die nog herkend werd, gaat opnieuw in de wachtrij (de foto is er nog). */
export function undoRemove(): void {
  if (!removed) return
  window.clearTimeout(removed.timer)
  const next = [...queue]
  for (const { item, index } of [...removed.items].sort((a, b) => a.index - b.index)) {
    const back = item.status === 'ready' || item.status === 'error' ? item : { ...item, status: 'waiting' as const }
    next.splice(Math.min(index, next.length), 0, back)
  }
  removed = null
  removedInfo = null
  set(next)
  pump()
}
