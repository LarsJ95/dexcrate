import { LANGUAGE_LABELS, type CardLanguage, type Variant } from './types'

export type ScanMode = 'single' | 'multi'

/** Eén herkende kaart uit de Edge Function recognize-card (zie supabase/functions/recognize-card). */
export interface Recognition {
  /** Volgorde op de foto (links→rechts, boven→onder), vanaf 1. */
  position: number
  namePrinted: string
  nameEnglish: string
  language: CardLanguage | null
  setCode: string
  cardNumber: string
  setTotal: string
  variant: Variant | null
  confidence: 'high' | 'medium' | 'low'
  notes: string
}

export interface ScanResult {
  cards: Recognition[]
  model: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function toRecognition(r: Record<string, unknown>, index: number): Recognition {
  const lang = str(r.language)
  const variant = str(r.variant)
  const confidence = str(r.confidence)
  return {
    position: typeof r.position === 'number' && Number.isInteger(r.position) ? r.position : index + 1,
    namePrinted: str(r.name_printed),
    nameEnglish: str(r.name_english),
    language: Object.hasOwn(LANGUAGE_LABELS, lang) ? (lang as CardLanguage) : null,
    setCode: str(r.set_code),
    cardNumber: str(r.card_number),
    setTotal: str(r.set_total),
    variant: variant === 'normal' || variant === 'holo' || variant === 'reverse' ? variant : null,
    confidence: confidence === 'high' || confidence === 'medium' ? confidence : 'low',
    notes: str(r.notes),
  }
}

/** Antwoord van de Edge Function → getypeerd resultaat, gesorteerd op positie. Onbekende vorm → fout. */
export function toScanResult(body: unknown): ScanResult {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  if (!b || !Array.isArray(b.cards)) throw new Error('Unexpected response from recognition. Is the latest function installed?')
  const cards = b.cards
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map(toRecognition)
    .sort((x, y) => x.position - y.position)
  return { cards, model: str(b.model) }
}

/** "001" → "1", zoals de rest van de collectie. */
export const plainNumber = (n: string): string => (/^\d+$/.test(n) ? String(Number.parseInt(n, 10)) : n)
