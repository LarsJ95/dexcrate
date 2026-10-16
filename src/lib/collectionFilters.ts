import { RARITY_FILTERS, SUFFIX_FILTERS, isEnergyType, rarityMatches, type EnergyType } from './cardTraits'
import type { CardInfo } from './tcgdex'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardInput, type CardLanguage, type Condition, type Variant } from './types'

/** Extra filters naast status en zoeken; '' = alle, 'none' = alleen zonder waarde (onbekend / geen locatie). */
export interface ExtraFilters {
  language: CardLanguage | '' | 'none'
  variant: Variant | '' | 'none'
  condition: Condition | '' | 'none'
  location: string
  /** Deel van de illustratornaam; leeg = alle. */
  illustrator: string
  /** Uit de catalogus: zeldzaamheid, energietype en kaarttype (ex, V …); leeg = alle. */
  rarity: string
  type: EnergyType | ''
  suffix: string
  /** 'unlinked' = alleen kaarten zonder koppeling met de catalogus. */
  link: '' | 'unlinked'
}

export const NO_EXTRA_FILTERS: ExtraFilters = { language: '', variant: '', condition: '', location: '', illustrator: '', rarity: '', type: '', suffix: '', link: '' }

export function activeFilterCount(f: ExtraFilters): number {
  return [f.language, f.variant, f.condition, f.location, f.illustrator.trim(), f.rarity, f.type, f.suffix, f.link].filter(Boolean).length
}

/** Wat de catalogusfilters van een kaart nodig hebben. */
export type CatalogTraits = Pick<CardInfo, 'illustrator' | 'rarity' | 'types' | 'suffix'>

export type CatalogFilters = Pick<ExtraFilters, 'rarity' | 'type' | 'suffix'>

/** Filtert op iets uit de catalogus (en moet dus kaartinfo laden)? */
export function needsCatalog(f: CatalogFilters & { illustrator?: string }): boolean {
  return Boolean(f.illustrator?.trim() || f.rarity || f.type || f.suffix)
}

/** Zeldzaamheid, type en kaarttype; zonder catalogusinfo past een kaart alleen als er niet op gefilterd wordt. */
export function matchesCatalog(info: CatalogTraits | null, f: CatalogFilters): boolean {
  if (!f.rarity && !f.type && !f.suffix) return true
  if (!info) return false
  if (f.rarity && !rarityMatches(info.rarity, f.rarity)) return false
  if (f.type && !(info.types ?? []).includes(f.type)) return false
  if (f.suffix && info.suffix !== f.suffix) return false
  return true
}

/** Losse kaart (geen sealed product) zonder koppeling met de catalogus. */
export const isUnlinked = (c: Pick<CardInput, 'kind' | 'tcgdex_id'>): boolean => c.kind === 'card' && !c.tcgdex_id

const fieldMatches = <T extends string>(value: T | null, wanted: T | '' | 'none'): boolean =>
  wanted === '' || (wanted === 'none' ? value === null : value === wanted)

/**
 * Past een kaart bij de extra filters? Illustrator, zeldzaamheid en types komen uit de catalogus:
 * `infoOf` geeft undefined zolang die nog laadt (dan niet wegfilteren) en null als hij onbekend is.
 */
export function matchesExtra(c: CardInput, f: ExtraFilters, infoOf: (c: CardInput) => CatalogTraits | null | undefined): boolean {
  if (!fieldMatches(c.language, f.language) || !fieldMatches(c.variant, f.variant) || !fieldMatches(c.condition, f.condition)) return false
  if (f.location === 'none' ? c.location_id !== null : f.location !== '' && c.location_id !== f.location) return false
  if (f.link === 'unlinked' && !isUnlinked(c)) return false
  if (!needsCatalog(f)) return true
  const info = infoOf(c)
  if (info === undefined) return true
  const wanted = f.illustrator.trim().toLowerCase()
  if (wanted && !info?.illustrator?.toLowerCase().includes(wanted)) return false
  return matchesCatalog(info, f)
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
        rarity: (RARITY_FILTERS as readonly string[]).includes(str(extra.rarity)) ? str(extra.rarity) : '',
        type: isEnergyType(extra.type) ? extra.type : '',
        suffix: (SUFFIX_FILTERS as readonly string[]).includes(str(extra.suffix)) ? str(extra.suffix) : '',
        link: extra.link === 'unlinked' ? 'unlinked' : '',
      },
    }
  } catch {
    return fallback
  }
}
