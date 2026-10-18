import { rarityRule } from './cardTraits'
import { tradeValue, type PackPull } from './crate'

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
