import type { JSX } from 'react'
import { ENERGY_TYPES, RARITY_FILTERS, SUFFIX_FILTERS, isEnergyType } from '../lib/cardTraits'
import type { CatalogFilters } from '../lib/collectionFilters'

interface Props {
  value: CatalogFilters
  onChange: (next: CatalogFilters) => void
}

const suffixLabel = (s: string): string => (s === 'ex' ? 'ex (Scarlet & Violet)' : s === 'EX' ? 'EX (XY era)' : s)

/** Filters uit de kaartcatalogus: zeldzaamheid, energietype en kaarttype (ex, V …). */
export function CatalogFilterFields({ value, onChange }: Props): JSX.Element {
  return (
    <>
      <label>
        Rarity
        <select value={value.rarity} onChange={(e) => onChange({ ...value, rarity: e.target.value })}>
          <option value="">All</option>
          {RARITY_FILTERS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select value={value.type} onChange={(e) => onChange({ ...value, type: isEnergyType(e.target.value) ? e.target.value : '' })}>
          <option value="">All</option>
          {ENERGY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Card type
        <select value={value.suffix} onChange={(e) => onChange({ ...value, suffix: e.target.value })}>
          <option value="">All</option>
          {SUFFIX_FILTERS.map((s) => (
            <option key={s} value={s}>
              {suffixLabel(s)}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
