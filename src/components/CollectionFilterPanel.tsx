import type { Dispatch, JSX, ReactNode, SetStateAction } from 'react'
import type { SetOption } from '../hooks/useSetOptions'
import type { ExtraFilters } from '../lib/collectionFilters'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS } from '../lib/types'
import { CatalogFilterFields } from './CatalogFilterFields'
import { FilterPanel } from './FilterPanel'

interface Props {
  /** Zoeken, status en sorteren (de werkbalk boven het paneel). */
  toolbar: ReactNode
  extra: ExtraFilters
  setExtra: Dispatch<SetStateAction<ExtraFilters>>
  setOptions: readonly SetOption[]
  activeCount: number
  /** Er staat een filter of zoekterm aan. */
  canClear: boolean
  onClear: () => void
}

/** Extra filters in Collection: set, taal, uitvoering, conditie, catalogus, koppeling en illustrator. */
export function CollectionFilterPanel({ toolbar, extra, setExtra, setOptions, activeCount, canClear, onClear }: Props): JSX.Element {
  return (
    <FilterPanel toolbar={toolbar} activeCount={activeCount} canClear={canClear} onClear={onClear}>
      <label className="span-2">
        Set
        <select value={extra.set} onChange={(e) => setExtra((f) => ({ ...f, set: e.target.value }))}>
          <option value="">All</option>
          {extra.set && !setOptions.some((o) => o.key === extra.set) && <option value={extra.set}>{extra.set}</option>}
          {setOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Language
        <select value={extra.language} onChange={(e) => setExtra((f) => ({ ...f, language: e.target.value as ExtraFilters['language'] }))}>
          <option value="">All</option>
          <option value="none">Unknown</option>
          {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Variant
        <select value={extra.variant} onChange={(e) => setExtra((f) => ({ ...f, variant: e.target.value as ExtraFilters['variant'] }))}>
          <option value="">All</option>
          <option value="none">Unknown</option>
          {Object.entries(VARIANT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Condition
        <select value={extra.condition} onChange={(e) => setExtra((f) => ({ ...f, condition: e.target.value as ExtraFilters['condition'] }))}>
          <option value="">All</option>
          <option value="none">Unknown</option>
          {Object.entries(CONDITION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <CatalogFilterFields value={extra} onChange={(next) => setExtra((f) => ({ ...f, ...next }))} />
      <label>
        Linked card
        <select value={extra.link} onChange={(e) => setExtra((f) => ({ ...f, link: e.target.value === 'unlinked' ? 'unlinked' : '' }))}>
          <option value="">All</option>
          <option value="unlinked">Not linked</option>
        </select>
      </label>
      <label>
        Illustrator
        <input value={extra.illustrator} maxLength={60} placeholder="e.g. Arita" onChange={(e) => setExtra((f) => ({ ...f, illustrator: e.target.value }))} />
        </label>
    </FilterPanel>
  )
}
