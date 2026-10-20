import { useState, type JSX, type ReactNode } from 'react'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { IconClose } from './Icons'
import { Sheet } from './Sheet'

/** Actief filter als chip boven de resultaten (telefoon); tikken haalt het filter weg. */
export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

interface Props {
  /** Aantal actieve filters (voor de telefoonknop en de voetregel). */
  activeCount: number
  /** Er staat iets aan dat "Clear all filters" kan wissen (filters of zoekterm). */
  canClear: boolean
  onClear: () => void
  /** Werkbalk erboven: zoeken, keuzeknoppen, sorteren; de telefoonknop "Filters" komt erachter. */
  toolbar: ReactNode
  /** Extra knoppen in de voetregel vóór "Clear all filters", bv. "Save as new list". */
  actions?: ReactNode
  /** Actieve filters als chips (telefoon). */
  chips?: readonly FilterChip[]
  /** Aantal resultaten met deze filters, voor de knop "Show 23 cards" (telefoon); undefined = nog niet bekend. */
  resultCount?: number
  /** Wat er getoond wordt: [enkelvoud, meervoud], standaard kaarten. */
  resultNoun?: readonly [string, string]
  /** De filtervelden: elk een <label> met veld, of een element met klasse filter-field. */
  children: ReactNode
}

/**
 * Filterpaneel, overal gelijk (DESIGN.md §8). Groot scherm: altijd open, velden met label erboven in een raster.
 * Telefoon (20-10-2026, gekozen door de gebruiker): filters in een venster van onderaf met een vaste knop
 * "Show N cards" die het sluit (Baymard: filters op mobiel als overlay met één duidelijke afsluitknop met aantal);
 * sluiten met ✕, terug of naast tikken bewaart de keuzes. Actieve filters staan als chips boven de resultaten.
 */
export function FilterPanel({ toolbar, activeCount, canClear, onClear, actions, chips = [], resultCount, resultNoun = ['card', 'cards'], children }: Props): JSX.Element {
  const phone = useMediaQuery(PHONE_QUERY)
  const [open, setOpen] = useState(false)
  const status = activeCount === 0 ? 'No filters active' : `${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} active`

  if (!phone) {
    return (
      <>
        <div className="filters">{toolbar}</div>
        <section className="panel filter-panel" aria-label="Filters">
          <div className="filter-grid">{children}</div>
          <div className="filter-foot">
            <span className="muted small">{status}</span>
            {actions}
            <button type="button" className="small-btn" disabled={!canClear} onClick={onClear}>
              Clear all filters
            </button>
          </div>
        </section>
      </>
    )
  }

  const show = resultCount === undefined ? 'Show results' : `Show ${resultCount} ${resultCount === 1 ? resultNoun[0] : resultNoun[1]}`
  return (
    <>
      <div className="filters">
        {toolbar}
        <button type="button" className={`filter-toggle${activeCount > 0 ? ' has-active' : ''}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>
      {chips.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Active filters">
          {chips.map((c) => (
            <button key={c.key} type="button" className="chip filter-chip" onClick={c.onRemove} aria-label={`Remove filter: ${c.label}`}>
              <span>{c.label}</span>
              <IconClose size={14} />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className="ghost small-btn" onClick={onClear}>
              Clear all
            </button>
          )}
        </div>
      )}
      {open && (
        <Sheet title="Filters" onClose={() => setOpen(false)}>
          <div className="filter-grid">{children}</div>
          <div className="filter-sheet-foot">
            {actions && <div className="filter-sheet-actions">{actions}</div>}
            <button type="button" className="ghost" disabled={!canClear} onClick={onClear}>
              Clear all
            </button>
            <button type="button" className="primary" onClick={() => setOpen(false)}>
              {show}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
