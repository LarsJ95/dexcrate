import { RARITY_FILTERS, SUFFIX_FILTERS, isEnergyType, type EnergyType } from './cardTraits'
import { matchesCatalog, type CatalogTraits } from './collectionFilters'
import { formatEur } from './stats'
import { setOfKey } from './tcgdex'
import { LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Variant } from './types'

/** Filters op de wishlist; ook de inhoud van een slimme lijst. '' / null = geen filter. */
export interface WishFilters {
  variant: Variant | ''
  language: CardLanguage | ''
  rarity: string
  type: EnergyType | ''
  suffix: string
  /** Marktprijs (Cardmarket, van de gezochte uitvoering) vanaf / tot en met, in euro. */
  minPrice: number | null
  maxPrice: number | null
  /** Alleen wensen waarvan de marktprijs binnen jouw max. prijs valt. */
  underMax: boolean
  priority: 1 | 2 | 3 | null
  /** Set-id uit de catalogus ("sv03.5"); oudere lijsten bevatten een setcode ("SCR"), die telt ook. */
  set: string
  showFound: boolean
}

export const NO_WISH_FILTERS: WishFilters = {
  variant: '',
  language: '',
  rarity: '',
  type: '',
  suffix: '',
  minPrice: null,
  maxPrice: null,
  underMax: false,
  priority: null,
  set: '',
  showFound: false,
}

/** Aantal actieve filters (zonder "Show found", dat is een weergave-keuze). */
export function activeWishFilterCount(f: WishFilters): number {
  return [f.variant, f.language, f.rarity, f.type, f.suffix, f.minPrice !== null, f.maxPrice !== null, f.underMax, f.priority !== null, f.set.trim()].filter(Boolean)
    .length
}

/** Filters die de kaartinfo uit de catalogus nodig hebben. */
export const needsWishCatalog = (f: WishFilters): boolean => Boolean(f.rarity || f.type || f.suffix)

/** Filters die marktprijzen nodig hebben. */
export const needsWishPrices = (f: WishFilters): boolean => f.minPrice !== null || f.maxPrice !== null || f.underMax

export interface WishRow {
  variant: Variant | null
  language: CardLanguage | null
  set_code: string | null
  priority: 1 | 2 | 3
  max_price: number | null
  tcgdex_id: string | null
}

export interface WishContext {
  found: boolean
  /** Marktprijs; undefined = nog aan het laden (dan niet wegfilteren), null = geen prijs. */
  market: number | null | undefined
  /** Kaartinfo; undefined = laden, null = onbekend. */
  info: CatalogTraits | null | undefined
}

/** Hoort de wens bij de set? Op catalogus-set-id, of (oude lijsten) op setcode. */
function inSet(item: WishRow, set: string): boolean {
  const s = item.tcgdex_id ? setOfKey(item.tcgdex_id) : null
  return s?.setId === set || (item.set_code ?? '').toLowerCase() === set.toLowerCase()
}

export function matchesWishFilters(item: WishRow, f: WishFilters, ctx: WishContext): boolean {
  if (!f.showFound && ctx.found) return false
  if (f.variant && item.variant !== f.variant) return false
  if (f.language && item.language !== f.language) return false
  if (f.priority !== null && item.priority !== f.priority) return false
  if (f.set.trim() && !inSet(item, f.set.trim())) return false
  if (needsWishCatalog(f)) {
    // Zonder koppeling geen zeldzaamheid of type: valt dan buiten het filter.
    if (!item.tcgdex_id) return false
    if (ctx.info !== undefined && !matchesCatalog(ctx.info, f)) return false
  }
  if (needsWishPrices(f) && ctx.market !== undefined) {
    if (ctx.market === null) return false
    if (f.minPrice !== null && ctx.market < f.minPrice) return false
    if (f.maxPrice !== null && ctx.market > f.maxPrice) return false
    if (f.underMax && (item.max_price === null || ctx.market > item.max_price)) return false
  }
  return true
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const price = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null)

/** Opgeslagen filters (database of oud formaat) inlezen; alles wat niet klopt valt terug op "geen filter". */
export function parseWishFilters(v: unknown): WishFilters {
  if (!isRecord(v)) return NO_WISH_FILTERS
  const variant = str(v.variant)
  const language = str(v.language)
  const rarity = str(v.rarity)
  const suffix = str(v.suffix)
  const p = v.priority
  return {
    variant: Object.hasOwn(VARIANT_LABELS, variant) ? (variant as Variant) : '',
    language: Object.hasOwn(LANGUAGE_LABELS, language) ? (language as CardLanguage) : '',
    rarity: (RARITY_FILTERS as readonly string[]).includes(rarity) ? rarity : '',
    type: isEnergyType(v.type) ? v.type : '',
    suffix: (SUFFIX_FILTERS as readonly string[]).includes(suffix) ? suffix : '',
    minPrice: price(v.minPrice),
    maxPrice: price(v.maxPrice),
    underMax: v.underMax === true,
    priority: p === 1 || p === 2 || p === 3 ? p : null,
    set: str(v.set).trim().slice(0, 20),
    showFound: v.showFound === true,
  }
}

/** Gelijk aan wat opgeslagen is? (Voor "lijst bijwerken".) */
export function sameWishFilters(a: WishFilters, b: WishFilters): boolean {
  return JSON.stringify(parseWishFilters(a)) === JSON.stringify(parseWishFilters(b))
}

const PRIORITY_NAMES = { 1: 'High priority', 2: 'Normal priority', 3: 'Low priority' } as const

/** Leesbare samenvatting van de filters, bv. "Fire, market €10.00 or less". */
export function describeWishFilters(f: WishFilters): string {
  const parts = [
    f.type,
    f.rarity,
    f.suffix && `${f.suffix} cards`,
    f.variant && VARIANT_LABELS[f.variant],
    f.language && LANGUAGE_LABELS[f.language],
    f.set.trim() && `set ${f.set.trim().toUpperCase()}`,
    f.priority !== null && PRIORITY_NAMES[f.priority],
    f.minPrice !== null && `market ${formatEur(f.minPrice)} or more`,
    f.maxPrice !== null && `market ${formatEur(f.maxPrice)} or less`,
    f.underMax && 'within your max. price',
    f.showFound && 'including found',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'No filters: all wishes'
}
