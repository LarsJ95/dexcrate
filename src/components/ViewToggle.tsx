import type { JSX } from 'react'
import type { ListView } from '../lib/listView'
import { IconGrid, IconList } from './Icons'

/** Raster (grote kaarten) of lijst (compacte regels); Collection en Wishlist (21-10-2026, op verzoek). */
export function ViewToggle({ value, onChange }: { value: ListView; onChange: (v: ListView) => void }): JSX.Element {
  return (
    <div className="segmented view-toggle" role="group" aria-label="View">
      <button type="button" aria-pressed={value === 'grid'} onClick={() => onChange('grid')} title="Large cards">
        <IconGrid size={18} />
        <span className="visually-hidden">Large cards</span>
      </button>
      <button type="button" aria-pressed={value === 'list'} onClick={() => onChange('list')} title="List">
        <IconList size={18} />
        <span className="visually-hidden">List</span>
      </button>
    </div>
  )
}
