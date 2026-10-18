import type { JSX, MouseEvent } from 'react'
import { IconClose } from './Icons'

/**
 * Kruisje rechts in een zoekveld (binnen `.search`): maakt het veld in één tik leeg en zet de cursor terug,
 * zodat je meteen iets nieuws kunt typen. Niets getypt = geen kruisje.
 */
export function SearchClear({ value, onClear }: { value: string; onClear: () => void }): JSX.Element | null {
  if (value === '') return null
  function clear(e: MouseEvent<HTMLButtonElement>): void {
    onClear()
    e.currentTarget.parentElement?.querySelector('input')?.focus()
  }
  return (
    <button type="button" className="ghost icon-btn search-clear" aria-label="Clear search" onClick={clear}>
      <IconClose size={18} />
    </button>
  )
}
