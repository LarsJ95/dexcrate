import type { CardLanguage, Variant } from './types'

/** Wat meetelt voor een compleet set-doel. */
export interface GoalSettings {
  /** Elke gekozen uitvoering is een eigen vakje; leeg = elke uitvoering van een kaart telt. */
  variants: Variant[]
  /** Kaarttalen die meetellen; leeg = elke taal. */
  languages: CardLanguage[]
  /** Secret rares (nummers boven de officiële telling) meetellen. */
  includeSecret: boolean
  /** Onderweg zijnde kaarten al als "in bezit" tellen. */
  includeIncoming: boolean
  /** Gewenst aantal per vakje. */
  wantedQty: number
}

export const DEFAULT_GOAL: GoalSettings = { variants: [], languages: [], includeSecret: true, includeIncoming: false, wantedQty: 1 }

export interface GoalCard {
  id: string
  localId: string
}

/** Eén vakje in het doel: een kaart, eventueel in een specifieke uitvoering (null = elke uitvoering). */
export interface Requirement {
  cardId: string
  variant: Variant | null
  /** Uitvoeringen van deze kaart waren onbekend in de catalogus: alleen "elke uitvoering" te controleren. */
  variantsUnknown: boolean
}

/** Eigen exemplaren in deze set (per kaartregel). */
export interface OwnedCopy {
  cardId: string
  variant: Variant | null
  language: CardLanguage | null
  quantity: number
  incoming: boolean
}

/** Is dit een secret rare? Alleen numerieke nummers boven de officiële telling. */
function isSecret(localId: string, official: number | null): boolean {
  if (!official) return false
  const n = Number.parseInt(localId, 10)
  return /^\d+$/.test(localId) && n > official
}

/**
 * Vakjes van het doel. Met gekozen uitvoeringen: per kaart alleen de uitvoeringen die volgens de catalogus
 * bestaan (een ex-kaart heeft geen reverse holo); onbekende uitvoeringen → één vakje "elke uitvoering".
 */
export function goalRequirements(
  cards: readonly GoalCard[],
  variantsByCard: ReadonlyMap<string, readonly Variant[] | null>,
  goal: GoalSettings,
  official: number | null,
): Requirement[] {
  const out: Requirement[] = []
  for (const c of cards) {
    if (!goal.includeSecret && isSecret(c.localId, official)) continue
    if (goal.variants.length === 0) {
      out.push({ cardId: c.id, variant: null, variantsUnknown: false })
      continue
    }
    const exists = variantsByCard.get(c.id) ?? null
    if (!exists) {
      out.push({ cardId: c.id, variant: null, variantsUnknown: true })
      continue
    }
    for (const v of goal.variants) if (exists.includes(v)) out.push({ cardId: c.id, variant: v, variantsUnknown: false })
  }
  return out
}

export interface RequirementState {
  req: Requirement
  /** In bezit (incl. onderweg als het doel dat meetelt). */
  have: number
  /** Onderweg, nog niet meegeteld. */
  ordered: number
  /** Ontbrekend tot het gewenste aantal. */
  missing: number
  /** Meer dan gewenst. */
  extra: number
}

export interface GoalProgress {
  states: RequirementState[]
  /** Vakjes die compleet zijn / totaal. */
  done: number
  total: number
  /** Unieke kaarten met minstens één passend exemplaar / kaarten in het doel. */
  cardsOwned: number
  cardsTotal: number
  /** Stuks boven het gewenste aantal. */
  duplicates: number
  /** Stuks onderweg die (nog) niet meetellen. */
  ordered: number
  /** Exemplaren zonder bekende uitvoering terwijl het doel per uitvoering telt. */
  unknownVariant: number
}

/**
 * Voortgang: een exemplaar telt alleen voor het vakje met precies zijn uitvoering (een normale kaart
 * vinkt de reverse holo niet af) en alleen in een meetellende taal.
 */
export function goalProgress(reqs: readonly Requirement[], copies: readonly OwnedCopy[], goal: GoalSettings): GoalProgress {
  const languageOk = (c: OwnedCopy): boolean => goal.languages.length === 0 || (c.language !== null && goal.languages.includes(c.language))
  const states: RequirementState[] = reqs.map((req) => {
    let have = 0
    let ordered = 0
    for (const c of copies) {
      if (c.cardId !== req.cardId || !languageOk(c)) continue
      if (req.variant !== null && c.variant !== req.variant) continue
      if (c.incoming && !goal.includeIncoming) ordered += c.quantity
      else have += c.quantity
    }
    return { req, have, ordered, missing: Math.max(0, goal.wantedQty - have), extra: Math.max(0, have - goal.wantedQty) }
  })
  const cardIds = new Set(reqs.map((r) => r.cardId))
  const ownedCards = new Set(states.filter((s) => s.have > 0).map((s) => s.req.cardId))
  const variantGoal = goal.variants.length > 0
  const unknownVariant = variantGoal
    ? copies.filter((c) => cardIds.has(c.cardId) && c.variant === null && languageOk(c)).reduce((n, c) => n + c.quantity, 0)
    : 0
  return {
    states,
    done: states.filter((s) => s.missing === 0).length,
    total: states.length,
    cardsOwned: ownedCards.size,
    cardsTotal: cardIds.size,
    duplicates: states.reduce((n, s) => n + s.extra, 0),
    ordered: states.reduce((n, s) => n + s.ordered, 0),
    unknownVariant,
  }
}
