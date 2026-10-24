import { autoPick, type Candidate } from './match'
import { languageNeedsCheck, type Recognition } from './scanResult'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Condition, type Variant } from './types'
import { fitVariant, type VariantFacts } from './variantChoice'

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
  /** Bij de herkende kaart verschilt de prijs per uitvoering flink: uitvoering even nakijken. */
  askVariant?: boolean
  /** Versie van het opzoeken waarmee de kandidaten gevonden zijn (zie MATCHER_VERSION); ontbreekt = 1. */
  matcher?: number
}

export const MAX_QUEUE = 250
export const MAX_QTY = 99

/**
 * Ophogen als het opzoeken beter wordt: bewaarde regels worden dan opnieuw opgezocht (geen nieuwe scan).
 * 2 = naamcontrole bij Aziatische kaarten (20-10-2026); 3 = Vereenvoudigd-Chinese catalogus en zoeken op gedrukte
 * naam bij trainers (20-10-2026).
 */
export const MATCHER_VERSION = 3

/** Chinese regel die je niet zelf hebt aangepast: opnieuw opzoeken zodra de Chinese catalogus binnen is. */
export const rematchAfterChs = (q: QueueItem): boolean =>
  q.status === 'ready' && (q.rec?.language === 'zh-cn' || q.rec?.language === 'zh-tw') && q.chosen === (autoPick(q.candidates)?.key ?? '')

/** Herkend met een oudere versie van het opzoeken. */
export const isOutdated = (q: QueueItem): boolean => q.status === 'ready' && q.rec !== null && (q.matcher ?? 1) < MATCHER_VERSION

/** Mag opnieuw opgezocht worden: verouderd, en je koos zelf geen andere kaart dan de app. */
export const needsRematch = (q: QueueItem): boolean => isOutdated(q) && q.chosen === (autoPick(q.candidates)?.key ?? '')

export function newItem(id: string, thumb: string, at = new Date().toISOString()): QueueItem {
  return { id, thumb, status: 'waiting', error: null, rec: null, candidates: [], chosen: '', quantity: 1, variant: null, include: false, at }
}

/**
 * Herkenning + kandidaten verwerken: beste match kiezen, standaard aanvinken als het leesbaar was.
 * `facts`: uitvoeringen en prijsverschil van de beste match (zie variantFacts); de gelezen uitvoering moet daarbij passen.
 */
export function withMatch(item: QueueItem, rec: Recognition, candidates: Candidate[], facts: VariantFacts | null = null): QueueItem {
  const best = autoPick(candidates)
  const { askVariant: _old, ...rest } = item
  void _old
  return {
    ...rest,
    status: 'ready',
    error: null,
    rec,
    candidates,
    chosen: best?.key ?? '',
    variant: fitVariant(rec.variant, best ? facts?.variants : null),
    // Taal alleen geraden (Europees, geen taalcode): niet vanzelf toevoegen, eerst nakijken (25-10-2026).
    include: best !== null && rec.confidence !== 'low' && !languageNeedsCheck(rec),
    ...(best && facts?.askVariant ? { askVariant: true } : {}),
    matcher: MATCHER_VERSION,
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
    ...(v.noCardData === true ? { noCardData: true } : {}),
    ...(v.otherNumber === true ? { otherNumber: true } : {}),
    ...(v.nameDiffers === true ? { nameDiffers: true } : {}),
    ...(v.remembered === true ? { remembered: true } : {}),
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
    ...(v.languageChecked === true ? { languageChecked: true } : {}),
  }
}

/**
 * Opgeslagen wachtrij inlezen. Wat nog niet herkend was, wacht weer; de foto zelf staat apart
 * (IndexedDB, zie scanQueueStore). Ontbreekt die, dan wordt het daar een fout.
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
      const failed = r.status === 'error'
      const variant = typeof r.variant === 'string' && Object.hasOwn(VARIANT_LABELS, r.variant) ? (r.variant as Variant) : null
      const qty = typeof r.quantity === 'number' && Number.isInteger(r.quantity) ? Math.min(MAX_QTY, Math.max(1, r.quantity)) : 1
      return [
        {
          id: r.id,
          thumb: r.thumb,
          status: ready ? 'ready' : failed ? 'error' : 'waiting',
          error: failed ? (typeof r.error === 'string' ? r.error : 'Recognition failed.') : null,
          rec,
          candidates: Array.isArray(r.candidates) ? r.candidates.flatMap((c) => toCandidate(c) ?? []) : [],
          chosen: str(r.chosen),
          quantity: qty,
          variant,
          include: ready && r.include === true,
          at: str(r.at),
          ...(ready && r.askVariant === true ? { askVariant: true } : {}),
          ...(typeof r.matcher === 'number' && Number.isInteger(r.matcher) ? { matcher: r.matcher } : {}),
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
  const twice = scannedTwice(queue)
  for (const q of queue) {
    if (q.status === 'error') out.check.push(q)
    else if (q.status !== 'ready') out.working.push(q)
    else if (!autoPick(q.candidates) || q.rec?.confidence !== 'high' || isAmbiguous(q) || withoutCardData(q) || twice.has(q.id) || q.askVariant) out.check.push(q)
    else out.good.push(q)
  }
  return out
}

/** Marge waaronder twee kandidaten als 'even goed' gelden: dan kiest de app niet zelf. */
const AMBIGUOUS_MARGIN = 0.5

/** Gekozen kaart alleen op set + nummer gekoppeld (geen kaartdata in de catalogus): naam en nummer even nakijken. */
export function withoutCardData(q: Pick<QueueItem, 'candidates' | 'chosen'>): boolean {
  return q.candidates.find((c) => c.key === q.chosen)?.noCardData === true
}

/** De beste match is niet duidelijk beter dan de tweede (bv. zelfde naam en nummer in twee sets). */
export function isAmbiguous(q: Pick<QueueItem, 'candidates'>): boolean {
  const [a, b] = q.candidates
  return Boolean(a && b) && a.score - b.score < AMBIGUOUS_MARGIN
}

/** Zoveel kandidaten als foto in een scanregel; de rest via "More…". */
const STRIP_SIZE = 3

/** Kandidaten als foto's in een scanregel: de beste drie; een elders gekozen kaart neemt de laatste plek. */
export function stripCandidates(candidates: readonly Candidate[], chosen: string): Candidate[] {
  const top = candidates.slice(0, STRIP_SIZE)
  const picked = chosen && !top.some((c) => c.key === chosen) ? candidates.find((c) => c.key === chosen) : undefined
  return picked ? [...top.slice(0, STRIP_SIZE - 1), picked] : top
}

/** Alleen suggesties met een ander nummer (bv. set ontbreekt in de catalogus): niets vanzelf gekozen. */
export function onlyOtherNumbers(q: Pick<QueueItem, 'candidates'>): boolean {
  return q.candidates.length > 0 && !autoPick(q.candidates)
}

/** Regels met dezelfde gekoppelde kaart als een andere regel (bv. twee keer gefotografeerd, andere variant gelezen). */
export function scannedTwice(queue: readonly QueueItem[]): ReadonlySet<string> {
  const byCard = new Map<string, string[]>()
  for (const q of queue) {
    if (q.status !== 'ready' || !q.chosen) continue
    byCard.set(q.chosen, [...(byCard.get(q.chosen) ?? []), q.id])
  }
  return new Set([...byCard.values()].filter((ids) => ids.length > 1).flat())
}
