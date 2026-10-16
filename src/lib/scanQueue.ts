import type { Candidate } from './match'
import type { Recognition } from './scanResult'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Condition, type Variant } from './types'

/**
 * Snel scannen: foto's gaan in een wachtrij en worden op de achtergrond herkend; later in één keer toevoegen.
 * Dit bestand bevat alleen de pure logica (samenvoegen, opslaan); de verwerking zit in ScanQueue.tsx.
 */

export type QueueStatus = 'waiting' | 'recognising' | 'matching' | 'ready' | 'error'

export interface QueueItem {
  id: string
  /** Kleine eigen foto (data-URL), om terug te zien wat je fotografeerde. */
  thumb: string
  status: QueueStatus
  error: string | null
  rec: Recognition | null
  candidates: Candidate[]
  /** Gekozen kaart-sleutel; '' = zonder koppeling. */
  chosen: string
  quantity: number
  variant: Variant | null
  /** Meenemen bij "Add all". */
  include: boolean
  at: string
}

export const MAX_QUEUE = 100
export const MAX_QTY = 99

export function newItem(id: string, thumb: string, at = new Date().toISOString()): QueueItem {
  return { id, thumb, status: 'waiting', error: null, rec: null, candidates: [], chosen: '', quantity: 1, variant: null, include: false, at }
}

/** Herkenning + kandidaten verwerken: beste match kiezen, standaard aanvinken als het leesbaar was. */
export function withMatch(item: QueueItem, rec: Recognition, candidates: Candidate[]): QueueItem {
  return {
    ...item,
    status: 'ready',
    error: null,
    rec,
    candidates,
    chosen: candidates[0]?.key ?? '',
    variant: rec.variant,
    include: candidates.length > 0 && rec.confidence !== 'low',
  }
}

/**
 * Een net herkende kaart die al eerder in de wachtrij staat (zelfde koppeling en uitvoering):
 * bij de eerdere optellen in plaats van een tweede regel. Geeft de nieuwe wachtrij terug.
 */
export function mergeDuplicate(queue: readonly QueueItem[], id: string): QueueItem[] {
  const item = queue.find((q) => q.id === id)
  if (!item || item.status !== 'ready' || !item.chosen) return [...queue]
  const earlier = queue.find((q) => q.id !== id && q.status === 'ready' && q.chosen === item.chosen && q.variant === item.variant)
  if (!earlier) return [...queue]
  return queue
    .filter((q) => q.id !== id)
    .map((q) => (q.id === earlier.id ? { ...q, quantity: Math.min(MAX_QTY, q.quantity + item.quantity), include: q.include || item.include } : q))
}

export interface QueueSummary {
  total: number
  busy: number
  ready: number
  failed: number
  selected: number
}

export function summarize(queue: readonly QueueItem[]): QueueSummary {
  const out: QueueSummary = { total: 0, busy: 0, ready: 0, failed: 0, selected: 0 }
  for (const q of queue) {
    out.total += q.quantity
    if (q.status === 'ready') out.ready += q.quantity
    else if (q.status === 'error') out.failed += 1
    else out.busy += 1
    if (q.status === 'ready' && q.include) out.selected += q.quantity
  }
  return out
}

// --- Bewaren op dit apparaat (zonder de grote foto's) ---

export const QUEUE_KEY = 'dexcrate:scan-queue'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function toCandidate(v: unknown): Candidate | null {
  if (!isRecord(v) || typeof v.key !== 'string' || typeof v.name !== 'string') return null
  return {
    key: v.key,
    name: v.name,
    localId: str(v.localId),
    setId: str(v.setId),
    setName: str(v.setName),
    image: typeof v.image === 'string' ? v.image : null,
    score: typeof v.score === 'number' ? v.score : 0,
    reason: str(v.reason),
  }
}

function toRecognition(v: unknown): Recognition | null {
  if (!isRecord(v) || typeof v.nameEnglish !== 'string') return null
  const conf = v.confidence === 'high' || v.confidence === 'medium' ? v.confidence : 'low'
  const variant = typeof v.variant === 'string' && Object.hasOwn(VARIANT_LABELS, v.variant) ? (v.variant as Variant) : null
  return {
    position: typeof v.position === 'number' ? v.position : 1,
    namePrinted: str(v.namePrinted),
    nameEnglish: v.nameEnglish,
    language: typeof v.language === 'string' && Object.hasOwn(LANGUAGE_LABELS, v.language) ? (v.language as CardLanguage) : null,
    setCode: str(v.setCode),
    cardNumber: str(v.cardNumber),
    setTotal: str(v.setTotal),
    variant,
    confidence: conf,
    notes: str(v.notes),
  }
}

/**
 * Opgeslagen wachtrij inlezen. Foto's die nog niet herkend waren zijn na herstarten weg
 * (alleen de kleine thumbnail wordt bewaard): die worden een fout met de vraag opnieuw te fotograferen.
 */
export function parseQueue(raw: string | null): QueueItem[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.slice(0, MAX_QUEUE).flatMap((r): QueueItem[] => {
      if (!isRecord(r) || typeof r.id !== 'string' || typeof r.thumb !== 'string' || !r.thumb.startsWith('data:image/')) return []
      const rec = toRecognition(r.rec)
      const ready = r.status === 'ready' && rec !== null
      const variant = typeof r.variant === 'string' && Object.hasOwn(VARIANT_LABELS, r.variant) ? (r.variant as Variant) : null
      const qty = typeof r.quantity === 'number' && Number.isInteger(r.quantity) ? Math.min(MAX_QTY, Math.max(1, r.quantity)) : 1
      return [
        {
          id: r.id,
          thumb: r.thumb,
          status: ready ? 'ready' : 'error',
          error: ready ? null : r.status === 'error' && typeof r.error === 'string' ? r.error : 'The app was closed before this photo was recognised. Take it again.',
          rec,
          candidates: Array.isArray(r.candidates) ? r.candidates.flatMap((c) => toCandidate(c) ?? []) : [],
          chosen: str(r.chosen),
          quantity: qty,
          variant,
          include: ready && r.include === true,
          at: str(r.at),
        },
      ]
    })
  } catch {
    return []
  }
}

export function isCondition(v: string): v is Condition {
  return Object.hasOwn(CONDITION_LABELS, v)
}

/**
 * Indeling voor het nakijken: eerst wat aandacht nodig heeft (mislukt, twijfel, geen match),
 * dan wat nog bezig is, dan wat goed lijkt. Op herkenning gebaseerd, niet op aanvinken,
 * zodat regels niet verspringen terwijl je ze aanpast.
 */
export function reviewGroups(queue: readonly QueueItem[]): { check: QueueItem[]; working: QueueItem[]; good: QueueItem[] } {
  const out = { check: [] as QueueItem[], working: [] as QueueItem[], good: [] as QueueItem[] }
  for (const q of queue) {
    if (q.status === 'error') out.check.push(q)
    else if (q.status !== 'ready') out.working.push(q)
    else if (q.candidates.length === 0 || q.rec?.confidence !== 'high') out.check.push(q)
    else out.good.push(q)
  }
  return out
}
