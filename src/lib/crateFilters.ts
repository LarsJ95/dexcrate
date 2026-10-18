import { rarityMatches, rarityRule, type EnergyType } from './cardTraits'
import { matchesCatalog, needsCatalog, type CatalogTraits } from './collectionFilters'
import type { CrateCard } from './crate'
import { setOfKey } from './tcgdex'

/**
 * Filters en sorteren voor de Crate (DESIGN.md §8: zelfde opbouw als Collection). Taal, uitvoering, conditie en
 * koppeling bestaan in de Crate niet: virtuele kaarten zijn altijd Engels en gekoppeld.
 */
export interface CrateFilters {
  /** Set ("en/sv03.5"); leeg = alle. */
  set: string
  rarity: string
  type: EnergyType | ''
  suffix: string
  illustrator: string
  /** Alleen kaarten waarvan je er meer dan één hebt. */
  duplicates: boolean
}

export const NO_CRATE_FILTERS: CrateFilters = { set: '', rarity: '', type: '', suffix: '', illustrator: '', duplicates: false }

export type CrateSort = 'newest' | 'rarity' | 'name' | 'set' | 'copies'
export const CRATE_SORTS: readonly CrateSort[] = ['newest', 'rarity', 'name', 'set', 'copies']

export function crateFilterCount(f: CrateFilters): number {
  return [f.set, f.rarity, f.type, f.suffix, f.illustrator.trim(), f.duplicates].filter(Boolean).length
}

/** Set van een Crate-kaart voor het setfilter ("en/sv03.5"). */
export const crateSetKey = (c: Pick<CrateCard, 'tcgdexId'>): string | null => {
  const s = setOfKey(c.tcgdexId)
  return s ? `${s.lang}/${s.setId}` : null
}

/** Zoeken op naam of set (hoofdletterongevoelig). */
export function matchesCrateSearch(c: Pick<CrateCard, 'name' | 'setName'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || c.name.toLowerCase().includes(q) || (c.setName ?? '').toLowerCase().includes(q)
}

/**
 * Past een Crate-kaart bij de filters? Zeldzaamheid staat op de kaart zelf; type, kaarttype en illustrator komen
 * uit de catalogus: `info` undefined = nog aan het laden (niet wegfilteren), null = onbekend.
 */
export function matchesCrate(c: CrateCard, f: CrateFilters, info: CatalogTraits | null | undefined): boolean {
  if (f.duplicates && c.quantity < 2) return false
  if (f.set && crateSetKey(c) !== f.set) return false
  if (f.rarity && !rarityMatches(c.rarity, f.rarity)) return false
  const catalog = { ...f, rarity: '' }
  if (!needsCatalog(catalog) || info === undefined) return true
  const wanted = f.illustrator.trim().toLowerCase()
  if (wanted && !info?.illustrator?.toLowerCase().includes(wanted)) return false
  return matchesCatalog(info, catalog)
}

/** Kaartnummer uit de sleutel ("en/sv03.5-025" → 25; niet-numeriek → oneindig, dus achteraan). */
const numberOf = (key: string): number => {
  const n = Number.parseInt(key.slice(key.lastIndexOf('-') + 1), 10)
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n
}

/** Gesorteerde kopie. 'newest' = volgorde uit de database (laatst getrokken eerst). */
export function sortCrate(cards: readonly CrateCard[], sort: CrateSort): CrateCard[] {
  const list = [...cards]
  const byName = (a: CrateCard, b: CrateCard): number => a.name.localeCompare(b.name, 'en')
  if (sort === 'rarity') list.sort((a, b) => rarityRule(b.rarity).rank - rarityRule(a.rarity).rank || byName(a, b))
  if (sort === 'name') list.sort(byName)
  if (sort === 'copies') list.sort((a, b) => b.quantity - a.quantity || byName(a, b))
  if (sort === 'set') {
    list.sort(
      (a, b) =>
        (a.setName ?? '').localeCompare(b.setName ?? '', 'en') ||
        (crateSetKey(a) ?? '').localeCompare(crateSetKey(b) ?? '', 'en') ||
        numberOf(a.tcgdexId) - numberOf(b.tcgdexId),
    )
  }
  return list
}

/** Sets in je Crate voor het setfilter, op naam. */
export function crateSetOptions(cards: readonly CrateCard[]): { key: string; label: string }[] {
  const out = new Map<string, string>()
  for (const c of cards) {
    const key = crateSetKey(c)
    if (key && !out.has(key)) out.set(key, c.setName ?? key)
  }
  return [...out].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'en'))
}
