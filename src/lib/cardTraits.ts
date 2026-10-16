import type { Variant } from './types'

/**
 * Kenmerken van een kaart uit de TCGdex-catalogus: energietype, zeldzaamheid, kaarttype (ex, V …)
 * en Pokédex-nummer. TCGdex levert deze waarden in het Engels voor en/ja/zh/ko.
 */

export const ENERGY_TYPES = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Dragon',
  'Fairy',
  'Colorless',
] as const
export type EnergyType = (typeof ENERGY_TYPES)[number]

export function isEnergyType(v: unknown): v is EnergyType {
  return typeof v === 'string' && (ENERGY_TYPES as readonly string[]).includes(v)
}

/** Bekende energietypes uit `types`; onbekende waarden vallen weg. */
export function parseTypes(v: unknown): EnergyType[] {
  return Array.isArray(v) ? v.filter(isEnergyType) : []
}

/** Eerste Pokédex-nummer uit `dexId`, of null (trainers, energie, onbekend). */
export function parseDexId(v: unknown): number | null {
  if (!Array.isArray(v)) return null
  const n: unknown = v[0]
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 10000 ? n : null
}

/** Glans die bij een zeldzaamheid hoort (DESIGN.md §9). */
export type FoilStyle = 'none' | 'holo' | 'illustration' | 'special' | 'gold'

/** Symbolen zoals onderaan de kaart; `gold` = gouden variant. */
export interface RaritySymbol {
  shape: 'circle' | 'diamond' | 'star'
  gold: boolean
}

interface RarityRule {
  foil: FoilStyle
  symbols: RaritySymbol[]
  /** Volgorde van laag naar hoog, voor sorteren en "zeldzaamste kaart". */
  rank: number
}

const sym = (shape: RaritySymbol['shape'], count: number, gold = false): RaritySymbol[] =>
  Array.from({ length: count }, () => ({ shape, gold }))

// Sleutels in kleine letters; TCGdex is niet consequent in hoofdletters ("Double rare", "Ultra Rare").
const RULES: Record<string, RarityRule> = {
  common: { foil: 'none', symbols: sym('circle', 1), rank: 1 },
  uncommon: { foil: 'none', symbols: sym('diamond', 1), rank: 2 },
  rare: { foil: 'none', symbols: sym('star', 1), rank: 3 },
  'rare holo': { foil: 'holo', symbols: sym('star', 1), rank: 4 },
  'holo rare': { foil: 'holo', symbols: sym('star', 1), rank: 4 },
  'rare holo lv.x': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'rare prime': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  legend: { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'holo rare v': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'holo rare vmax': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'holo rare vstar': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'amazing rare': { foil: 'special', symbols: sym('star', 1), rank: 6 },
  'radiant rare': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'ace spec rare': { foil: 'holo', symbols: sym('star', 1), rank: 5 },
  'double rare': { foil: 'holo', symbols: sym('star', 2), rank: 5 },
  'ultra rare': { foil: 'illustration', symbols: sym('star', 2), rank: 6 },
  'full art trainer': { foil: 'illustration', symbols: sym('star', 1), rank: 6 },
  'illustration rare': { foil: 'illustration', symbols: sym('star', 1, true), rank: 7 },
  'shiny rare': { foil: 'holo', symbols: sym('star', 1, true), rank: 6 },
  'shiny rare v': { foil: 'illustration', symbols: sym('star', 1, true), rank: 7 },
  'shiny rare vmax': { foil: 'illustration', symbols: sym('star', 1, true), rank: 7 },
  'shiny ultra rare': { foil: 'special', symbols: sym('star', 2, true), rank: 8 },
  'secret rare': { foil: 'special', symbols: sym('star', 1, true), rank: 8 },
  'special illustration rare': { foil: 'special', symbols: sym('star', 2, true), rank: 9 },
  'hyper rare': { foil: 'gold', symbols: sym('star', 3, true), rank: 10 },
  'mega hyper rare': { foil: 'gold', symbols: sym('star', 3, true), rank: 10 },
  crown: { foil: 'gold', symbols: sym('star', 1, true), rank: 10 },
}

const UNKNOWN: RarityRule = { foil: 'none', symbols: [], rank: 0 }

export function rarityRule(rarity: string | null | undefined): RarityRule {
  if (!rarity) return UNKNOWN
  return Object.hasOwn(RULES, rarity.toLowerCase()) ? RULES[rarity.toLowerCase()] : UNKNOWN
}

/** Zeldzaamheid als tekst, of null als TCGdex niets bruikbaars geeft. */
export function parseRarity(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'none' ? v.trim() : null
}

/** Kaarttype-achtervoegsel (ex, EX, V, VMAX …), of null. */
export function parseSuffix(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Glans voor een kaart: de zeldzaamheid bepaalt hem; zonder glans-zeldzaamheid geeft de uitvoering
 * (holo, reverse holo) een eenvoudige glans.
 */
export function foilStyleFor(variant: Variant | null, rarity: string | null | undefined): FoilStyle {
  const byRarity = rarityRule(rarity).foil
  if (byRarity !== 'none') return byRarity
  if (variant === 'holo') return 'holo'
  if (variant === 'reverse') return 'illustration'
  return 'none'
}

/** Zeldzaamheden om op te filteren (TCGdex-namen; vergelijken zonder hoofdletters). */
export const RARITY_FILTERS = [
  'Common',
  'Uncommon',
  'Rare',
  'Rare Holo',
  'Double rare',
  'Ultra Rare',
  'Illustration rare',
  'Special illustration rare',
  'Hyper rare',
  'Secret Rare',
  'Shiny rare',
  'ACE SPEC Rare',
  'Radiant Rare',
  'Amazing Rare',
  'Promo',
] as const

/** Kaarttypes om op te filteren; "ex" (Scarlet & Violet) en "EX" (XY-tijdperk) zijn verschillende kaarten. */
export const SUFFIX_FILTERS = ['ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR'] as const

/** Zeldzaamheid gelijk aan het filter; "Rare Holo" en "Holo Rare" zijn hetzelfde. */
export function rarityMatches(rarity: string | null | undefined, wanted: string): boolean {
  if (!rarity) return false
  const norm = (s: string): string => (s.toLowerCase() === 'holo rare' ? 'rare holo' : s.toLowerCase())
  return norm(rarity) === norm(wanted)
}

/** Niveau van een zeldzaamheid voor de kleur van een chip: gewoon, zeldzaam, speciaal of goud. */
export function rarityTier(rarity: string | null | undefined): 'common' | 'rare' | 'special' | 'gold' {
  const rank = rarityRule(rarity).rank
  if (rank >= 10) return 'gold'
  if (rank >= 5) return 'special'
  if (rank >= 3) return 'rare'
  return 'common'
}
