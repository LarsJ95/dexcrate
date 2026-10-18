// Setbinder: paginaformaat, kostenstatus en wat per set op dit apparaat onthouden wordt.
import { ENERGY_TYPES } from './cardTraits'
import { energyColor } from './energy'
import type { RequirementState } from './goals'
import { formatEur } from './stats'
import type { Variant } from './types'

/** Vakjes per binderpagina (idee uit DEX, 18-10-2026): 2×2 t/m 5×5, plus 6 (2 kolommen, fijn op de telefoon). */
export const PAGE_SIZES = [4, 6, 9, 12, 15, 16, 20, 25] as const
export type PageSize = (typeof PAGE_SIZES)[number]

/** Kolommen per paginaformaat. */
export const PAGE_COLUMNS: Record<PageSize, number> = { 4: 2, 6: 2, 9: 3, 12: 4, 15: 5, 16: 4, 20: 5, 25: 5 }

/** "9 (3×3)" */
export const pageSizeLabel = (size: PageSize): string => `${size} (${PAGE_COLUMNS[size]}×${size / PAGE_COLUMNS[size]})`

/** Eerste pagina overslaan: links begint de map met de lege binnenkant van de kaft, zoals een echt album. */
export const SKIP_FIRST_KEY = 'dexcrate:binder-skip-first'

export function readSkipFirst(): boolean {
  try {
    return localStorage.getItem(SKIP_FIRST_KEY) === '1'
  } catch {
    return false
  }
}

export interface Cost {
  done: number
  total: number
  /** "<kaart-id>|<uitvoering>" → marktprijs per stuk (null = onbekend) */
  prices: Map<string, number | null>
  running: boolean
}

/** Korte aanduiding van een uitvoering in een binder-vak. */
export const VARIANT_SHORT: Record<Variant, string> = { normal: 'N', holo: 'H', reverse: 'R', firstEdition: '1st' }

export const formatValue = (v: number | null): string => (v === null ? 'no price' : formatEur(v))

export const stateKey = (s: RequirementState): string => `${s.req.cardId}|${s.req.variant ?? 'any'}`

export const PAGE_SIZE_KEY = 'dexcrate:binder-page-size'
/** Kaarten in bezit bij het vorige bezoek, om nieuwe in hun vak te laten springen. */
export const SEEN_KEY = 'dexcrate:binder-seen:'
/** Set al gevierd als compleet; weer weg als de set niet meer compleet is. */
export const COMPLETE_KEY = 'dexcrate:set-complete:'
/** Hoogste gevierde mijlpaal per set. */
export const MILESTONE_KEY = 'dexcrate:set-milestone:'
export const MAX_NEW = 12
export const SPARKLE_COLORS = ENERGY_TYPES.filter((t) => t !== 'Colorless').map(energyColor)

export function readSeen(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null // geen opslag of kapotte waarde: als eerste bezoek behandelen
  }
}

export function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch (err) {
    console.warn('Binderstatus onthouden mislukt', err)
  }
}
const OLD_PAGE_SIZE_KEY = 'binderline:binder-page-size'

export function readPageSize(): PageSize {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY) ?? localStorage.getItem(OLD_PAGE_SIZE_KEY))
    return PAGE_SIZES.find((s) => s === n) ?? 9
  } catch {
    return 9 // geen opslag: standaard 9-pocket
  }
}
