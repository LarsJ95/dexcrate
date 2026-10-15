import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardInput, type CardLanguage, type Condition, type Variant } from './types'

/** Extra filters naast status en zoeken; '' = alle, 'none' = alleen zonder waarde (onbekend / geen locatie). */
export interface ExtraFilters {
  language: CardLanguage | '' | 'none'
  variant: Variant | '' | 'none'
  condition: Condition | '' | 'none'
  location: string
  /** Deel van de illustratornaam; leeg = alle. */
  illustrator: string
}

export const NO_EXTRA_FILTERS: ExtraFilters = { language: '', variant: '', condition: '', location: '', illustrator: '' }

export function activeFilterCount(f: ExtraFilters): number {
  return [f.language, f.variant, f.condition, f.location, f.illustrator.trim()].filter(Boolean).length
}

const fieldMatches = <T extends string>(value: T | null, wanted: T | '' | 'none'): boolean =>
  wanted === '' || (wanted === 'none' ? value === null : value === wanted)

/**
 * Past een kaart bij de extra filters? Illustrator komt uit de catalogus: `illustratorOf` geeft
 * undefined zolang die nog laadt (dan niet wegfilteren) en null als hij onbekend is.
 */
export function matchesExtra(c: CardInput, f: ExtraFilters, illustratorOf: (c: CardInput) => string | null | undefined): boolean {
  if (!fieldMatches(c.language, f.language) || !fieldMatches(c.variant, f.variant) || !fieldMatches(c.condition, f.condition)) return false
  if (f.location === 'none' ? c.location_id !== null : f.location !== '' && c.location_id !== f.location) return false
  const wanted = f.illustrator.trim().toLowerCase()
  if (wanted) {
    const name = illustratorOf(c)
    if (name === undefined) return true
    if (!name || !name.toLowerCase().includes(wanted)) return false
  }
  return true
}

/** Opgeslagen weergave van Collection (per apparaat). */
export interface SavedView<S extends string, F extends string> {
  query: string
  filter: F
  sort: S
  extra: ExtraFilters
}

/** Alleen bekende waarden (of '' / 'none') overnemen. */
function allowed<K extends string>(v: string, labels: Record<K, string>): K | '' | 'none' {
  return v === 'none' || Object.hasOwn(labels, v) ? (v as K | 'none') : ''
}

/** Opgeslagen weergave inlezen; alles wat niet klopt valt terug op de standaard. */
export function parseView<S extends string, F extends string>(
  raw: string | null,
  sorts: readonly S[],
  filters: readonly F[],
  fallback: SavedView<S, F>,
): SavedView<S, F> {
  if (!raw) return fallback
  try {
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return fallback
    const o = v as Record<string, unknown>
    const extra = typeof o.extra === 'object' && o.extra !== null ? (o.extra as Record<string, unknown>) : {}
    const str = (x: unknown): string => (typeof x === 'string' ? x : '')
    return {
      query: str(o.query).slice(0, 100),
      filter: filters.includes(o.filter as F) ? (o.filter as F) : fallback.filter,
      sort: sorts.includes(o.sort as S) ? (o.sort as S) : fallback.sort,
      extra: {
        language: allowed(str(extra.language), LANGUAGE_LABELS),
        variant: allowed(str(extra.variant), VARIANT_LABELS),
        condition: allowed(str(extra.condition), CONDITION_LABELS),
        location: str(extra.location),
        illustrator: str(extra.illustrator).slice(0, 60),
      },
    }
  } catch {
    return fallback
  }
}
