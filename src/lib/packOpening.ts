import { rarityRule } from './cardTraits'
import { crateSetProgress, tradeValue, type PackPull } from './crate'

/**
 * Pack opening (Crate, 18-10-2026): kaarten één voor één, zeldzaamste als laatste, met NEW of "je hebt er nu N".
 * De kaarten staan al in je Crate zodra het pakje betaald is; dit bepaalt alleen wat je ziet en wat je kunt inruilen.
 */

export interface RevealCard extends PackPull {
  /** Eerste exemplaar in je Crate (niet eerder gehad en niet eerder in dit pakje). */
  isNew: boolean
  /** Hoeveel je er hebt nadat deze kaart erbij kwam. */
  copies: number
}

/** Volgorde van onthullen: zeldzaamheid oplopend (zeldzaamste als laatste); gelijke zeldzaamheid in trekvolgorde. */
export function revealOrder(pulls: readonly PackPull[], before: ReadonlyMap<string, number>): RevealCard[] {
  const sorted = pulls.map((p, i) => ({ p, i })).sort((a, b) => rarityRule(a.p.rarity).rank - rarityRule(b.p.rarity).rank || a.i - b.i)
  const count = new Map(before)
  return sorted.map(({ p }) => {
    const copies = (count.get(p.tcgdex_id) ?? 0) + 1
    count.set(p.tcgdex_id, copies)
    return { ...p, isNew: copies === 1, copies }
  })
}

/** Aantal per kaart van dit pakje na het openen (wat er nu in je Crate zit). */
export function countsAfter(cards: readonly RevealCard[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of cards) out.set(c.tcgdex_id, Math.max(out.get(c.tcgdex_id) ?? 0, c.copies))
  return out
}

/**
 * Punten voor het inruilen van de dubbelen van de kaarten uit dit pakje (van elke kaart blijft er één over).
 * `counts` = huidige aantallen (na eventueel al inruilen).
 */
export function duplicatePoints(cards: readonly RevealCard[], counts: ReadonlyMap<string, number>, factor: number): number {
  const seen = new Set<string>()
  let points = 0
  for (const c of cards) {
    if (seen.has(c.tcgdex_id)) continue
    seen.add(c.tcgdex_id)
    points += Math.max(0, (counts.get(c.tcgdex_id) ?? 0) - 1) * tradeValue(c.rarity, factor)
  }
  return points
}

/**
 * Hoe bijzonder een kaart is voor de effecten (24-10-2026, "meer spel"): 0 gewoon, 1 hit (Double/Ultra rare),
 * 2 Illustration/Shiny/Secret, 3 Special illustration, Hyper en hoger. Bepaalt kleur van stralen en het teasen.
 */
export function hitTier(rarity: string | null | undefined): 0 | 1 | 2 | 3 {
  const rank = rarityRule(rarity).rank
  return rank >= 9 ? 3 : rank >= 7 ? 2 : rank >= 5 ? 1 : 0
}

/** Beste kaart van het pakje: het bijzonderst. */
export function packTier(cards: readonly Pick<PackPull, 'rarity'>[]): 0 | 1 | 2 | 3 {
  return cards.reduce<0 | 1 | 2 | 3>((t, c) => Math.max(t, hitTier(c.rarity)) as 0 | 1 | 2 | 3, 0)
}

/**
 * "Best pull" in het overzicht: de meeste marktwaarde; zonder prijzen (nog niet geladen) de zeldzaamste.
 * Bij gelijkstand de zeldzaamste, daarna de laatst onthulde. null bij een leeg pakje.
 */
export function bestPull(cards: readonly Pick<PackPull, 'tcgdex_id' | 'rarity'>[], valueOf: (id: string) => number | null): number | null {
  let best: number | null = null
  let bestValue = -1
  let bestRank = -1
  cards.forEach((c, i) => {
    const value = valueOf(c.tcgdex_id) ?? -1
    const rank = rarityRule(c.rarity).rank
    if (value > bestValue || (value === bestValue && rank >= bestRank)) {
      best = i
      bestValue = value
      bestRank = rank
    }
  })
  return best
}

export interface SetGain {
  setKey: string
  name: string
  before: number
  after: number
  official: number
}

/**
 * Setvoortgang na het pakje: per set waarin je er een nieuwe kaart bij kreeg, hoeveel je er had en nu hebt (alleen
 * de officiële nummers, net als de setbonus). Grootste stap eerst. `official` = officieel aantal per set ("en/sv08").
 */
export function setGains(cards: readonly RevealCard[], before: ReadonlyMap<string, number>, official: ReadonlyMap<string, number>): SetGain[] {
  const setOf = (id: string): string => id.slice(0, id.lastIndexOf('-'))
  const had = [...before.keys()].map((tcgdexId) => ({ tcgdexId }))
  const now = [...had, ...cards.map((c) => ({ tcgdexId: c.tcgdex_id }))]
  const out: SetGain[] = []
  for (const setKey of new Set(cards.filter((c) => c.isNew).map((c) => setOf(c.tcgdex_id)))) {
    const total = official.get(setKey) ?? 0
    if (total <= 0) continue
    const b = crateSetProgress(had, setKey, total)
    const a = crateSetProgress(now, setKey, total)
    if (a > b) out.push({ setKey, name: cards.find((c) => setOf(c.tcgdex_id) === setKey)?.set_name ?? setKey, before: b, after: a, official: total })
  }
  return out.sort((x, y) => y.after - y.before - (x.after - x.before) || x.name.localeCompare(y.name))
}

/** Nummer zoals op de kaart: "057/191" (officieel aantal bekend) of "#057"; null zonder nummer. */
export function printedNumber(tcgdexId: string, official: ReadonlyMap<string, number>): string | null {
  const dash = tcgdexId.lastIndexOf('-')
  if (dash < 0 || dash === tcgdexId.length - 1) return null
  const total = official.get(tcgdexId.slice(0, dash))
  const local = tcgdexId.slice(dash + 1)
  return total ? `${local}/${total}` : `#${local}`
}
