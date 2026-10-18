import { useMemo, useState, type JSX } from 'react'
import { matchesSearch } from '../lib/search'
import { statusBadge, type Card } from '../lib/types'
import { IconSearch } from './Icons'
import { SearchClear } from './SearchClear'

const MAX_RESULTS = 8

/** Kaart uit je collectie kiezen: zoeken op naam, set of nummer. */
export function CardPicker({ cards, onPick, onCancel }: { cards: readonly Card[]; onPick: (c: Card) => void; onCancel: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? cards.filter((c) => matchesSearch(c, query)).slice(0, MAX_RESULTS) : []), [cards, query])
  return (
    <div className="card-picker">
      <div className="search">
        <IconSearch size={18} />
        <input type="search" placeholder="Name, set or number" aria-label="Find card" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
        <SearchClear value={query} onClear={() => setQuery('')} />
      </div>
      {results.length > 0 && (
        <ul className="picker-results">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="ghost" onClick={() => onPick(c)}>
                <span className="picker-name">{c.name}</span>
                <span className="muted small">
                  {[c.set_code, c.card_number && `#${c.card_number}`, statusBadge(c), c.quantity > 1 ? `${c.quantity}×` : null].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p className="muted small">No matching cards.</p>}
      <button type="button" className="ghost small-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

