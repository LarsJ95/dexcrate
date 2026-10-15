import type { JSX } from 'react'
import { rarityRule, type RaritySymbol } from '../lib/cardTraits'
import { ENERGY_GLYPHS } from '../lib/energy'
import type { EnergyType } from '../lib/cardTraits'

const SHAPES: Record<RaritySymbol['shape'], JSX.Element> = {
  circle: <circle cx="12" cy="12" r="7" />,
  diamond: <path d="M12 3l8 9-8 9-8-9z" />,
  star: <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />,
}

/** Zeldzaamheidssymbolen zoals onderaan de kaart (cirkel, ruit, sterren; goud voor de hoogste). */
export function RaritySymbols({ rarity, size = 12 }: { rarity: string | null | undefined; size?: number }): JSX.Element | null {
  const symbols = rarityRule(rarity).symbols
  if (!rarity || symbols.length === 0) return null
  return (
    <span className="rarity-symbols" role="img" aria-label={rarity} title={rarity}>
      {symbols.map((s, i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} className={s.gold ? 'gold' : undefined} aria-hidden="true">
          {SHAPES[s.shape]}
        </svg>
      ))}
    </span>
  )
}

/** Energiesymbool van een type, in de huidige tekstkleur. */
export function EnergyIcon({ type, size = 14 }: { type: EnergyType; size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ENERGY_GLYPHS[type]} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}
