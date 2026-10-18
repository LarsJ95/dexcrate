import { useMemo, useState, type FormEvent, type JSX } from 'react'
import { errorText } from '../lib/errors'
import { matchesWords } from '../lib/search'
import type { WishlistItem } from '../lib/wishlist'
import { setListItems, type WishlistList } from '../lib/wishlistLists'
import { IconSearch } from './Icons'
import { SearchClear } from './SearchClear'
import { Sheet } from './Sheet'

interface Props {
  list: WishlistList
  items: readonly WishlistItem[]
  /** Wensen die nu in de lijst staan. */
  members: ReadonlySet<string>
  onClose: () => void
  onSaved: (members: ReadonlySet<string>) => void
}

/** Eigen lijst vullen: in één keer kiezen welke wensen erin staan. */
export function WishListPickSheet({ list, items, members, onClose, onSaved }: Props): JSX.Element {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(members))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = useMemo(
    () => items.filter((i) => matchesWords([i.name, i.set_code, i.card_number, i.card_number && `#${i.card_number}`], query)),
    [items, query],
  )

  function toggle(id: string, on: boolean): void {
    setChosen((cur) => {
      const next = new Set(cur)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const add = [...chosen].filter((id) => !members.has(id))
    const remove = [...members].filter((id) => !chosen.has(id))
    setBusy(true)
    setError(null)
    try {
      await setListItems(list.id, { add, remove })
      onSaved(chosen)
    } catch (err) {
      setError(errorText(err, 'Saving the list failed.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Choose wishes: ${list.name}`} onClose={onClose}>
      <form className="sheet-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="search">
          <IconSearch size={18} />
          <input type="search" value={query} placeholder="Search your wishes, e.g. Pikachu" aria-label="Search your wishes" enterKeyHint="search" onChange={(e) => setQuery(e.target.value)} />
          <SearchClear value={query} onClear={() => setQuery('')} />
        </div>
        {items.length === 0 && <p className="muted">Your wishlist is empty. Add wishes first.</p>}
        {items.length > 0 && shown.length === 0 && <p className="muted">No wishes match.</p>}
        <div className="check-list" role="group" aria-label="Wishes">
          {shown.map((i) => (
            <label key={i.id} className="check">
              <input type="checkbox" checked={chosen.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
              <span>
                {i.name}
                {(i.set_code || i.card_number) && <span className="muted"> · {[i.set_code, i.card_number && `#${i.card_number}`].filter(Boolean).join(' ')}</span>}
              </span>
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="sheet-foot">
          <span className="muted small">{chosen.size} chosen</span>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
