import { useId, useState, type JSX, type ReactNode } from 'react'

interface Props {
  /** Aantal actieve filters (voor de telefoonknop en de voetregel). */
  activeCount: number
  /** Er staat iets aan dat "Clear all filters" kan wissen (filters of zoekterm). */
  canClear: boolean
  onClear: () => void
  /** Extra knoppen in de voetregel vóór "Clear all filters", bv. "Save as new list". */
  actions?: ReactNode
  /** De filtervelden: elk een <label> met veld, of een element met klasse filter-field. */
  children: ReactNode
}

/**
 * Filterpaneel, overal gelijk (DESIGN.md §8): velden met label erboven in een raster, vinkjes in
 * hetzelfde raster, onderaan rechts de acties. Groot scherm altijd open; op de telefoon in te klappen.
 */
export function FilterPanel({ activeCount, canClear, onClear, actions, children }: Props): JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>
      <section id={id} className={`panel filter-panel${open ? ' is-open' : ''}`} aria-label="Filters">
        <div className="filter-grid">{children}</div>
        <div className="filter-foot">
          <span className="muted small">{activeCount === 0 ? 'No filters active' : `${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} active`}</span>
          {actions}
          <button type="button" className="small-btn" disabled={!canClear} onClick={onClear}>
            Clear all filters
          </button>
        </div>
      </section>
    </>
  )
}
