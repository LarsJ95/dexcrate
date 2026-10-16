import type { EnergyType } from './cardTraits'

/**
 * Pokémon-laag op Overview: typekleur van je collectie, Pokédex-voortgang, partner-Pokémon en badges.
 * Alles puur (getest); de kaartinfo komt van de catalogus.
 */

export interface OwnedInfo {
  /** Aantal exemplaren in bezit. */
  quantity: number
  /** Marktwaarde per stuk, of null. */
  value: number | null
  types: readonly EnergyType[] | null
  dexId: number | null
}

/** Meest verzamelde energietype (op aantal exemplaren), zonder Colorless; null als er niets is. */
export function dominantType(owned: readonly OwnedInfo[]): EnergyType | null {
  const count = new Map<EnergyType, number>()
  for (const o of owned) {
    const t = o.types?.find((x) => x !== 'Colorless')
    if (t) count.set(t, (count.get(t) ?? 0) + o.quantity)
  }
  let best: EnergyType | null = null
  for (const [t, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = t
  return best
}

/** Generaties met hun laatste Pokédex-nummer (nationale Pokédex, t/m generatie IX). */
export const GENERATIONS = [151, 251, 386, 493, 649, 721, 809, 905, 1025] as const
export const NATIONAL_DEX = GENERATIONS[GENERATIONS.length - 1]

export interface DexProgress {
  caught: number
  total: number
  perGen: { gen: number; caught: number; total: number }[]
}

/** Unieke Pokémon in je collectie, in totaal en per generatie. */
export function pokedexProgress(dexIds: Iterable<number>): DexProgress {
  const unique = new Set([...dexIds].filter((d) => Number.isInteger(d) && d >= 1 && d <= NATIONAL_DEX))
  const perGen = GENERATIONS.map((last, i) => {
    const first = i === 0 ? 1 : GENERATIONS[i - 1] + 1
    let caught = 0
    for (const d of unique) if (d >= first && d <= last) caught += 1
    return { gen: i + 1, caught, total: last - first + 1 }
  })
  return { caught: unique.size, total: NATIONAL_DEX, perGen }
}

/** Partner: de Pokémon waar je de meeste exemplaren van hebt; bij gelijkstand de waardevolste. */
export function partnerDexId(owned: readonly OwnedInfo[]): number | null {
  const per = new Map<number, { qty: number; value: number }>()
  for (const o of owned) {
    if (!o.dexId) continue
    const p = per.get(o.dexId) ?? { qty: 0, value: 0 }
    p.qty += o.quantity
    p.value = Math.max(p.value, o.value ?? 0)
    per.set(o.dexId, p)
  }
  let best: number | null = null
  for (const [dex, p] of per) {
    const b = best === null ? null : per.get(best)
    if (!b || p.qty > b.qty || (p.qty === b.qty && p.value > b.value)) best = dex
  }
  return best
}

export interface Badge {
  id: string
  name: string
  /** Waarmee je hem verdient, bv. "25 cards". */
  goal: string
  earned: boolean
  /** Voortgang 0..1. */
  progress: number
  /** Kleur (CSS-variabele) van de badge. */
  color: string
  /** Huidige stand en doel, bv. 41 van 50 kaarten. */
  have: number
  target: number
  kind: 'cards' | 'species' | 'value'
  /** Uitleg in een zin. */
  how: string
}

interface BadgeRule {
  id: string
  name: string
  kind: 'cards' | 'species' | 'value'
  target: number
  color: string
}

/** Acht badges, zoals de gym-badges in de games; verdiend met mijlpalen in je collectie. */
const RULES: readonly BadgeRule[] = [
  { id: 'boulder', name: 'Boulder Badge', kind: 'cards', target: 10, color: 'var(--energy-metal)' },
  { id: 'cascade', name: 'Cascade Badge', kind: 'cards', target: 25, color: 'var(--energy-water)' },
  { id: 'thunder', name: 'Thunder Badge', kind: 'cards', target: 50, color: 'var(--energy-lightning)' },
  { id: 'rainbow', name: 'Rainbow Badge', kind: 'cards', target: 100, color: 'var(--energy-grass)' },
  { id: 'soul', name: 'Soul Badge', kind: 'species', target: 25, color: 'var(--energy-fairy)' },
  { id: 'marsh', name: 'Marsh Badge', kind: 'species', target: 100, color: 'var(--energy-psychic)' },
  { id: 'volcano', name: 'Volcano Badge', kind: 'value', target: 500, color: 'var(--energy-fire)' },
  { id: 'earth', name: 'Earth Badge', kind: 'value', target: 1000, color: 'var(--energy-fighting)' },
]

const HOW_TEXT: Record<BadgeRule['kind'], string> = {
  cards: 'Own this many cards (copies count).',
  species: 'Own cards of this many different Pokémon (your Pokédex).',
  value: 'Reach this collection value (Cardmarket trend prices).',
}

const GOAL_TEXT: Record<BadgeRule['kind'], (n: number) => string> = {
  cards: (n) => `${n} cards`,
  species: (n) => `${n} different Pokémon`,
  value: (n) => `Collection worth €${n.toLocaleString('en-IE')}`,
}

export function badges(stats: { cards: number; species: number; value: number }): Badge[] {
  return RULES.map((r) => {
    const have = r.kind === 'cards' ? stats.cards : r.kind === 'species' ? stats.species : stats.value
    return {
      id: r.id,
      name: r.name,
      goal: GOAL_TEXT[r.kind](r.target),
      earned: have >= r.target,
      progress: Math.min(1, Math.max(0, have / r.target)),
      color: r.color,
      have,
      target: r.target,
      kind: r.kind,
      how: HOW_TEXT[r.kind],
    }
  })
}

/** Trainernaam uit het e-mailadres ("lars.vanhamburg@…" → "Lars"); leeg = "Trainer". */
export function trainerName(email: string | null | undefined): string {
  const first = (email ?? '').split('@')[0].split(/[._+-]/)[0].replace(/[^\p{L}\p{N}]/gu, '')
  return first ? first.charAt(0).toUpperCase() + first.slice(1, 20) : 'Trainer'
}

/** Kleur van een HP-balk zoals in de games: groen boven 50%, geel boven 20%, anders rood. */
export function hpLevel(ratio: number): 'high' | 'mid' | 'low' {
  return ratio > 0.5 ? 'high' : ratio > 0.2 ? 'mid' : 'low'
}

/** Trainer-titels zoals in de games, oplopend met het aantal badges. */
export const TITLES = [
  { badges: 0, title: 'Youngster' },
  { badges: 1, title: 'Rookie Trainer' },
  { badges: 2, title: 'Ace Trainer' },
  { badges: 4, title: 'Gym Leader' },
  { badges: 6, title: 'Elite Four' },
  { badges: 8, title: 'Champion' },
] as const

/** Huidige titel en de volgende (met hoeveel badges die nodig heeft). */
export function trainerTitle(earned: number): { title: string; next: { title: string; badges: number } | null } {
  let i = 0
  for (let j = 0; j < TITLES.length; j++) if (earned >= TITLES[j].badges) i = j
  const next = TITLES[i + 1]
  return { title: TITLES[i].title, next: next ? { title: next.title, badges: next.badges } : null }
}

/** Regio per generatie (de spellen waar die Pokémon voor het eerst verschenen). */
export const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'] as const

/** Eerste en laatste Pokédex-nummer van een generatie (1-9). */
export function generationRange(gen: number): { first: number; last: number } {
  const last = GENERATIONS[gen - 1]
  return { first: gen === 1 ? 1 : GENERATIONS[gen - 2] + 1, last }
}

/**
 * Zwakte per energietype zoals op de kaarten (Scarlet & Violet-tijdperk): een Pokémon van type X
 * krijgt dubbele schade van WEAK_TO[X]. Dragon heeft op moderne kaarten geen zwakte.
 */
export const WEAK_TO: Readonly<Record<EnergyType, EnergyType | null>> = {
  Grass: 'Fire',
  Fire: 'Water',
  Water: 'Lightning',
  Lightning: 'Fighting',
  Psychic: 'Darkness',
  Fighting: 'Psychic',
  Darkness: 'Grass',
  Metal: 'Fire',
  Dragon: null,
  Fairy: 'Metal',
  Colorless: 'Fighting',
}

export interface TeamType {
  type: EnergyType
  count: number
  /** Types waar dit type super effectief tegen is. */
  strongAgainst: EnergyType[]
  weakTo: EnergyType | null
}

/** Je collectie als team: aantal exemplaren per type, met sterk/zwak tegen. Meeste eerst. */
export function typeTeam(owned: readonly OwnedInfo[]): TeamType[] {
  const count = new Map<EnergyType, number>()
  for (const o of owned) {
    const t = o.types?.[0]
    if (t) count.set(t, (count.get(t) ?? 0) + o.quantity)
  }
  return [...count]
    .map(([type, n]) => ({
      type,
      count: n,
      strongAgainst: (Object.keys(WEAK_TO) as EnergyType[]).filter((t) => WEAK_TO[t] === type),
      weakTo: WEAK_TO[type],
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

/** Types die je team niet super effectief kan raken (niemand in je team is daar sterk tegen). */
export function teamGaps(team: readonly TeamType[]): EnergyType[] {
  const covered = new Set(team.flatMap((t) => t.strongAgainst))
  return (Object.keys(WEAK_TO) as EnergyType[]).filter((t) => WEAK_TO[t] !== null && !covered.has(t))
}

/** Regio en generatie bij een Pokédex-nummer, of null buiten 1-1025. */
export function regionOf(dexId: number): { gen: number; region: string } | null {
  const i = GENERATIONS.findIndex((last) => dexId <= last)
  return dexId >= 1 && i >= 0 ? { gen: i + 1, region: REGIONS[i] } : null
}
