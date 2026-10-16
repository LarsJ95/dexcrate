import { isEnergyType, type EnergyType } from './cardTraits'

/** Spelgegevens van een kaart zoals TCGdex ze geeft: HP, aanvallen, zwakte enz. */
export interface CardGame {
  category: 'Pokemon' | 'Trainer' | 'Energy' | null
  hp: number | null
  /** "Basic", "Stage1", "Stage2", "VMAX" … */
  stage: string | null
  evolveFrom: string | null
  /** Pokédex-tekst, als TCGdex die heeft. */
  description: string | null
  abilities: { type: string; name: string; effect: string }[]
  attacks: { name: string; cost: EnergyType[]; damage: string | null; effect: string | null }[]
  weaknesses: { type: EnergyType; value: string }[]
  resistances: { type: EnergyType; value: string }[]
  retreat: number | null
  /** Trainer- of energietekst. */
  effect: string | null
  /** "Item", "Supporter", "Stadium", "Tool" … */
  trainerType: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max = 600): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 8) : [])

function typedValues(v: unknown): { type: EnergyType; value: string }[] {
  return list(v).flatMap((w) => (isRecord(w) && isEnergyType(w.type) ? [{ type: w.type, value: text(w.value, 10) ?? '' }] : []))
}

const STAGE_LABELS: Record<string, string> = { Basic: 'Basic', Stage1: 'Stage 1', Stage2: 'Stage 2' }

export const stageLabel = (stage: string): string => STAGE_LABELS[stage] ?? stage

/** Kaartdetails van TCGdex → spelgegevens; onbekende of rare waarden vallen weg. */
export function parseCardGame(data: Record<string, unknown>): CardGame {
  const category = data.category === 'Pokemon' || data.category === 'Trainer' || data.category === 'Energy' ? data.category : null
  return {
    category,
    hp: int(data.hp, 1000),
    stage: text(data.stage, 20),
    evolveFrom: text(data.evolveFrom, 40),
    description: text(data.description, 400),
    abilities: list(data.abilities).flatMap((a) => (isRecord(a) && text(a.name, 60) ? [{ type: text(a.type, 20) ?? 'Ability', name: text(a.name, 60) as string, effect: text(a.effect) ?? '' }] : [])),
    attacks: list(data.attacks).flatMap((a) => {
      if (!isRecord(a) || !text(a.name, 60)) return []
      const damage = typeof a.damage === 'number' ? String(a.damage) : text(a.damage, 10)
      return [{ name: text(a.name, 60) as string, cost: list(a.cost).filter(isEnergyType), damage, effect: text(a.effect) }]
    }),
    weaknesses: typedValues(data.weaknesses),
    resistances: typedValues(data.resistances),
    retreat: int(data.retreat, 10),
    effect: text(data.effect),
    trainerType: text(data.trainerType, 20),
  }
}
