import type { JSX } from 'react'
import { CatalogFilterFields } from './CatalogFilterFields'
import { SetPicker } from './SetPicker'
import { lookupLang } from '../lib/tcgdex'
import { LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Variant } from '../lib/types'
import type { WishFilters } from '../lib/wishFilters'

/** Prijsveld → bedrag of null (leeg of ongeldig = geen filter). */
const priceInput = (text: string): number | null => {
  if (text.trim() === '') return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

interface Props {
  filters: WishFilters
  setFilter: (patch: Partial<WishFilters>) => void
}

/** Filtervelden van de wishlist (inhoud van het filterpaneel). */
export function WishFilterFields({ filters, setFilter }: Props): JSX.Element {
  return (
    <>
      <label>
        Variant
        <select value={filters.variant} onChange={(e) => setFilter({ variant: e.target.value as Variant | '' })}>
          <option value="">All</option>
          {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
            <option key={v} value={v}>
              {VARIANT_LABELS[v]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Language
        <select value={filters.language} onChange={(e) => setFilter({ language: e.target.value as CardLanguage | '' })}>
          <option value="">All</option>
          {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
      </label>
      <CatalogFilterFields value={filters} onChange={(next) => setFilter({ rarity: next.rarity, type: next.type, suffix: next.suffix })} />
      <label>
        Priority
        <select
          value={filters.priority ?? ''}
          onChange={(e) => {
            const p = Number(e.target.value)
            setFilter({ priority: p === 1 || p === 2 || p === 3 ? p : null })
          }}
        >
          <option value="">All</option>
          <option value="1">High</option>
          <option value="2">Normal</option>
          <option value="3">Low</option>
        </select>
      </label>
      <div className="span-2">
        <SetPicker value={filters.set.trim()} lang={lookupLang(filters.language || null)} onChange={(set) => setFilter({ set })} />
      </div>
      <div className="filter-field span-2" role="group" aria-labelledby="wish-market-label">
        <span className="filter-label" id="wish-market-label">
          Market price (€)
        </span>
        <div className="filter-range">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="from"
            aria-label="Market price from"
            value={filters.minPrice ?? ''}
            onChange={(e) => setFilter({ minPrice: priceInput(e.target.value) })}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="to"
            aria-label="Market price to"
            value={filters.maxPrice ?? ''}
            onChange={(e) => setFilter({ maxPrice: priceInput(e.target.value) })}
          />
        </div>
      </div>
      <div className="filter-checks">
        <label className="check">
          <input type="checkbox" checked={filters.underMax} onChange={(e) => setFilter({ underMax: e.target.checked })} />
          Within my max. price
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.showFound} onChange={(e) => setFilter({ showFound: e.target.checked })} />
          Show found
        </label>
      </div>
    </>
  )
}
