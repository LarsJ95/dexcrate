// Setbinder: paginaformaat, kostenstatus en wat per set op dit apparaat onthouden wordt.
import { ENERGY_TYPES } from './cardTraits'
import { energyColor } from './energy'
import type { RequirementState } from './goals'
import { formatEur } from './stats'
import type { Variant } from './types'

export type PageSize = 9 | 12

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
    return (localStorage.getItem(PAGE_SIZE_KEY) ?? localStorage.getItem(OLD_PAGE_SIZE_KEY)) === '12' ? 12 : 9
  } catch {
    return 9 // geen opslag: standaard 9-pocket
  }
}
