import type { JSX, ReactNode } from 'react'
import { ENERGY_TYPES, RARITY_FILTERS, SUFFIX_FILTERS, isEnergyType } from '../lib/cardTraits'
import type { CatalogFilters } from '../lib/collectionFilters'

interface Props {
  value: CatalogFilters
  onChange: (next: CatalogFilters) => void
  /** Zonder zichtbaar label, voor een filterrij (zoals op Wishlist); de eerste optie zegt wat het is. */
  compact?: boolean
}

const suffixLabel = (s: string): string => (s === 'ex' ? 'ex (Scarlet & Violet)' : s === 'EX' ? 'EX (XY era)' : s)

/** Filters uit de kaartcatalogus: zeldzaamheid, energietype en kaarttype (ex, V …). */
export function CatalogFilterFields({ value, onChange, compact = false }: Props): JSX.Element {
  const field = (label: string, all: string, select: (allOption: ReactNode) => JSX.Element): JSX.Element =>
    compact ? select(<option value="">{all}</option>) : (
      <label>
        {label}
        {select(<option value="">All</option>)}
      </label>
    )
  return (
    <>
      {field('Rarity', 'All rarities', (allOption) => (
        <select aria-label={compact ? 'Rarity' : undefined} value={value.rarity} onChange={(e) => onChange({ ...value, rarity: e.target.value })}>
          {allOption}
          {RARITY_FILTERS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ))}
      {field('Type', 'All types', (allOption) => (
        <select
          aria-label={compact ? 'Type' : undefined}
          value={value.type}
          onChange={(e) => onChange({ ...value, type: isEnergyType(e.target.value) ? e.target.value : '' })}
        >
          {allOption}
          {ENERGY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ))}
      {field('Card type', 'All card types', (allOption) => (
        <select aria-label={compact ? 'Card type' : undefined} value={value.suffix} onChange={(e) => onChange({ ...value, suffix: e.target.value })}>
          {allOption}
          {SUFFIX_FILTERS.map((s) => (
            <option key={s} value={s}>
              {suffixLabel(s)}
            </option>
          ))}
        </select>
      ))}
    </>
  )
}
