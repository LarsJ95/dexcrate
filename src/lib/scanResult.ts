import type { MatchQuery } from './match'
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

/**
 * Wat de scan las, kort: "Read as SV8 #062 · Chinese (simplified) (uncertain)". Alleen tonen bij twijfel (audit S5,
 * 20-10-2026): bij een zekere match zie je de kaart zelf al.
 */
export function readLabel(r: Pick<Recognition, 'setCode' | 'cardNumber' | 'language' | 'confidence'>): string {
  const card = [r.setCode, r.cardNumber ? `#${r.cardNumber}` : ''].filter(Boolean).join(' ')
  const parts = [card, r.language ? LANGUAGE_LABELS[r.language] : ''].filter(Boolean)
  return `${parts.length > 0 ? `Read as ${parts.join(' · ')}` : 'Nothing readable'}${r.confidence !== 'high' ? ' (uncertain)' : ''}`
}

/** Zoekvraag voor de catalogus bij een herkende kaart. */
export function scanQuery(r: Recognition): MatchQuery {
  return { name: r.nameEnglish, name_printed: r.namePrinted || null, set_code: r.setCode || null, card_number: r.cardNumber || null, set_total: r.setTotal || null }
}

export interface ReadFix {
  name: string
  setCode: string
  cardNumber: string
  setTotal: string
  language: CardLanguage | null
}

/**
 * Door jou gecorrigeerde gelezen waarden. "004/012" in het nummerveld wordt nummer + totaal.
 * Je hebt het zelf nagekeken, dus de twijfel van de scan vervalt.
 */
export function correctRecognition(r: Recognition, fix: ReadFix): Recognition {
  const [num, ofTotal] = fix.cardNumber.split('/').map((s) => s.trim())
  const name = fix.name.trim().slice(0, 200)
  return {
    ...r,
    // Andere naam ingevuld: de gedrukte naam van de scan hoort dan niet meer bij deze kaart.
    namePrinted: name === r.nameEnglish ? r.namePrinted : '',
    nameEnglish: name,
    language: fix.language,
    setCode: fix.setCode.trim().slice(0, 20),
    cardNumber: (num ?? '').slice(0, 20),
    setTotal: (ofTotal || fix.setTotal.trim()).slice(0, 10),
    confidence: 'high',
    notes: '',
  }
}
