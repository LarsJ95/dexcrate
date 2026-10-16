import { findCandidates } from './match'
import { prepareImage, recognizeCards, type PreparedImage } from './scan'
import { MAX_QUEUE, QUEUE_KEY, mergeDuplicate, newItem, parseQueue, withMatch, type QueueItem } from './scanQueue'
import { lookupLang } from './tcgdex'

/**
 * Wachtrij voor snel scannen, buiten React: herkennen loopt door als je even naar een andere pagina gaat.
 * Bewaard op dit apparaat (localStorage, zonder de grote foto's).
 */

const PARALLEL = 3
const THUMB_EDGE = 220

let queue: QueueItem[] = load()
const listeners = new Set<() => void>()
/** Foto's die nog herkend moeten worden (of opnieuw kunnen), alleen in het geheugen. */
const images = new Map<string, PreparedImage>()
const running = new Set<string>()

function load(): QueueItem[] {
  try {
    return parseQueue(localStorage.getItem(QUEUE_KEY))
  } catch {
    return [] // geen opslag beschikbaar
  }
}

function persist(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('Scan-wachtrij bewaren mislukt', err)
  }
}

function set(next: QueueItem[]): void {
  queue = next
  persist()
  for (const l of listeners) l()
}

const patch = (id: string, p: Partial<QueueItem>): void => set(queue.map((q) => (q.id === id ? { ...q, ...p } : q)))

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
}

/** Foto toevoegen; herkennen start op de achtergrond. */
export async function enqueue(file: File): Promise<void> {
  if (queue.length >= MAX_QUEUE) throw new Error(`The scan queue is full (${MAX_QUEUE}). Add or clear cards first.`)
  const img = await prepareImage(file, 'single')
  const thumb = await makeThumb(img.blob)
  const id = crypto.randomUUID()
  images.set(id, img)
  // Pas na alle await's de huidige wachtrij lezen: anders gaan foto's die tegelijk binnenkomen verloren.
  set([...queue, newItem(id, thumb)])
  pump()
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
      return
    }
    patch(id, { status: 'matching', rec })
    const candidates = await findCandidates({ name: rec.nameEnglish, set_code: rec.setCode || null, card_number: rec.cardNumber || null }, lookupLang(rec.language)).catch(
      (err: unknown) => {
        console.warn('Kaart opzoeken mislukt', err)
        return []
      },
    )
    // Item kan intussen verwijderd zijn.
    if (!queue.some((q) => q.id === id)) return
    set(mergeDuplicate(queue.map((q) => (q.id === id ? withMatch(q, rec, candidates) : q)), id))
    dropImage(id)
  } catch (err) {
    console.error('Scannen mislukt', err)
    if (queue.some((q) => q.id === id)) patch(id, { status: 'error', error: err instanceof Error ? err.message : 'Recognition failed.' })
  }
}

/** Wachtende foto's starten, maximaal PARALLEL tegelijk. */
function pump(): void {
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
