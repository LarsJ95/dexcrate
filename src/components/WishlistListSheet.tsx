import { useState, type FormEvent, type JSX } from 'react'
import { NO_WISH_FILTERS, describeWishFilters, type WishFilters } from '../lib/wishFilters'
import { MAX_LIST_NAME, addWishlistList, deleteWishlistList, listNameError, updateWishlistList, type WishlistList, type WishlistListKind } from '../lib/wishlistLists'
import { Sheet } from './Sheet'
import { errorText } from '../lib/errors'

interface Props {
  /** Bestaande lijst (hernoemen/verwijderen) of null (nieuwe lijst). */
  list: WishlistList | null
  /** Soort nieuwe lijst: 'smart' bewaart de huidige filters, 'manual' begint leeg. */
  kind?: WishlistListKind
  filters: WishFilters
  /** Aantal wensen in een eigen lijst (alleen voor de tekst). */
  count?: number
  existing: readonly WishlistList[]
  onClose: () => void
  onSaved: (list: WishlistList) => void
  onDeleted: (id: string) => void
}

/** Lijst opslaan (slim of eigen), hernoemen of verwijderen. */
export function WishlistListSheet({ list, kind = 'smart', filters, count = 0, existing, onClose, onSaved, onDeleted }: Props): JSX.Element {
  const manual = (list?.kind ?? kind) === 'manual'
  const [name, setName] = useState(list?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const problem = listNameError(name, existing, list?.id ?? null)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(list ? await updateWishlistList(list.id, { name }) : await addWishlistList(name, manual ? NO_WISH_FILTERS : filters, existing.length, manual ? 'manual' : 'smart'))
    } catch (err) {
      setError(errorText(err, 'Saving the list failed.'))
      setBusy(false)
    }
  }

  async function onDelete(): Promise<void> {
    if (!list || busy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteWishlistList(list.id)
      onDeleted(list.id)
    } catch (err) {
      setError(errorText(err, 'Removing the list failed.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title={list ? `List: ${list.name}` : manual ? 'New list' : 'Save as list'} onClose={onClose}>
      <form className="sheet-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Name
          <input value={name} maxLength={MAX_LIST_NAME} placeholder={manual ? 'e.g. Pikachu collection' : 'e.g. Under €10'} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <p className="muted small">
          {manual
            ? list
              ? `${count} ${count === 1 ? 'wish' : 'wishes'} in this list. Removing the list keeps the wishes.`
              : 'You choose which wishes go in it: with “Choose wishes”, or when adding or editing a wish.'
            : `Shows: ${describeWishFilters(list?.filters ?? filters)}`}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="sheet-foot">
          {list && (
            <button type="button" className={confirmDelete ? 'danger' : 'ghost danger-text'} onClick={() => void onDelete()} disabled={busy}>
              {confirmDelete ? 'Really remove?' : 'Remove list'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {list ? 'Save' : 'Save list'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
