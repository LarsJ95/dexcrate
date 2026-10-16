import type { CSSProperties, JSX } from 'react'
import { rarityTier, type EnergyType } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import { EnergyIcon, RaritySymbols } from './RaritySymbols'

/** Type-chip in de kleur van het eigen energietype van de kaart (Grass groen, Fire rood …). */
export function TypeChip({ type }: { type: EnergyType }): JSX.Element {
  return (
    <span className="chip chip-type" style={{ '--chip': energyColor(type) } as CSSProperties}>
      <EnergyIcon type={type} />
      {type}
    </span>
  )
}

/** Zeldzaamheid-chip met symbolen, gekleurd naar niveau. */
export function RarityChip({ rarity }: { rarity: string }): JSX.Element {
  return (
    <span className="chip chip-rarity" data-tier={rarityTier(rarity)}>
      <RaritySymbols rarity={rarity} />
      {rarity}
    </span>
  )
}
