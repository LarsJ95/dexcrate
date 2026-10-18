import { ENERGY_TYPES, rarityRule, type EnergyType } from './cardTraits'

/**
 * Voortgang van de trainer, puur uit je collectie berekend (dus gelijk op elk apparaat):
 * XP en level, verborgen prestaties, de Pokémon van de dag en het weekrapport.
 */

export interface ProgressCard {
  quantity: number
  dexId: number | null
  types: readonly EnergyType[] | null
  rarity: string | null
  language: string | null
  /** Marktwaarde per stuk, of null. */
  value: number | null
  /** Toegevoegd op (ISO). */
  createdAt: string | null
  name: string
  id: string
}

// --- XP en level ---

/** XP: 10 per kaart, extra voor zeldzaamheid, 15 per verschillende Pokémon, 50 per badge. */
export function xpFor(cards: readonly ProgressCard[], badgesEarned: number): number {
  let xp = 0
  const species = new Set<number>()
  for (const c of cards) {
    xp += c.quantity * (10 + rarityRule(c.rarity).rank * 2)
    if (c.dexId) species.add(c.dexId)
  }
  return xp + species.size * 15 + badgesEarned * 50
}

export const MAX_LEVEL = 100

/**
 * Totale XP die nodig is om level n te bereiken (level 1 = 0). Kwadratisch, zodat hoge levels echt veel vragen:
 * ongeveer 40 kaarten → level 6, 250 → 13, 1000 → 24.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, level)) - 1
  return 50 * n * n
}

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1
  if (level === MAX_LEVEL) return { level, into: 0, needed: 0 }
  return { level, into: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) }
}

// --- Verborgen prestaties ---

export interface Achievement {
  id: string
  name: string
  /** Uitleg, pas zichtbaar als je hem hebt. */
  how: string
  earned: boolean
}

const MAIN_TYPES: readonly EnergyType[] = ENERGY_TYPES.filter((t) => t !== 'Colorless' && t !== 'Dragon' && t !== 'Fairy')

interface Rule {
  id: string
  name: string
  how: string
  test: (ctx: { dex: ReadonlySet<number>; dexCount: ReadonlyMap<number, number>; cards: readonly ProgressCard[] }) => boolean
}

const anyOf = (dex: ReadonlySet<number>, ids: readonly number[]): boolean => ids.some((d) => dex.has(d))
const allOf = (dex: ReadonlySet<number>, ids: readonly number[]): boolean => ids.every((d) => dex.has(d))
const rarityIn = (cards: readonly ProgressCard[], names: readonly string[]): boolean =>
  cards.some((c) => c.rarity !== null && names.includes(c.rarity.toLowerCase()))

const RULES: readonly Rule[] = [
  { id: 'kanto-starters', name: 'Professor Oak’s Lab', how: 'Own a Pokémon from each Kanto starter line (Bulbasaur, Charmander, Squirtle).', test: ({ dex }) => anyOf(dex, [1, 2, 3]) && anyOf(dex, [4, 5, 6]) && anyOf(dex, [7, 8, 9]) },
  { id: 'eeveelutions', name: 'Eevee’s Family', how: 'Own Eevee and all eight Eeveelutions.', test: ({ dex }) => allOf(dex, [133, 134, 135, 136, 196, 197, 470, 471, 700]) },
  { id: 'birds', name: 'Legendary Birds', how: 'Own Articuno, Zapdos and Moltres.', test: ({ dex }) => allOf(dex, [144, 145, 146]) },
  { id: 'rainbow', name: 'Type Master', how: 'Own a card of Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness and Metal type.', test: ({ cards }) => MAIN_TYPES.every((t) => cards.some((c) => c.types?.includes(t))) },
  { id: 'pika-fan', name: 'Pikachu Fan Club', how: 'Own five Pikachu cards.', test: ({ dexCount }) => (dexCount.get(25) ?? 0) >= 5 },
  { id: 'sir', name: 'Work of Art', how: 'Own a Special illustration rare.', test: ({ cards }) => rarityIn(cards, ['special illustration rare']) },
  { id: 'gold', name: 'Golden Touch', how: 'Own a Hyper rare (gold) card.', test: ({ cards }) => rarityIn(cards, ['hyper rare', 'mega hyper rare', 'crown']) },
  { id: 'world', name: 'World Traveller', how: 'Own cards in three or more languages.', test: ({ cards }) => new Set(cards.flatMap((c) => (c.language ? [c.language] : []))).size >= 3 },
  { id: 'mew', name: 'Mythical Encounter', how: 'Own a card of Mew.', test: ({ dex }) => dex.has(151) },
  { id: 'dragons', name: 'Dragon Tamer', how: 'Own Dratini, Dragonair and Dragonite.', test: ({ dex }) => allOf(dex, [147, 148, 149]) },
]

export function achievements(cards: readonly ProgressCard[]): Achievement[] {
  const dexCount = new Map<number, number>()
  for (const c of cards) if (c.dexId) dexCount.set(c.dexId, (dexCount.get(c.dexId) ?? 0) + c.quantity)
  const ctx = { dex: new Set(dexCount.keys()), dexCount, cards }
  return RULES.map((r) => ({ id: r.id, name: r.name, how: r.how, earned: r.test(ctx) }))
}
