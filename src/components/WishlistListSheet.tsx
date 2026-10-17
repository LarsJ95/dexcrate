import { useState, type FormEvent, type JSX } from 'react'
import { describeWishFilters, type WishFilters } from '../lib/wishFilters'
import { MAX_LIST_NAME, addWishlistList, deleteWishlistList, listNameError, updateWishlistList, type WishlistList } from '../lib/wishlistLists'
import { Sheet } from './Sheet'
import { errorText } from '../lib/errors'

interface Props {
  /** Bestaande lijst (hernoemen/verwijderen) of null (nieuwe lijst met de huidige filters). */
  list: WishlistList | null
  filters: WishFilters
  existing: readonly WishlistList[]
  onClose: () => void
  onSaved: (list: WishlistList) => void
  onDeleted: (id: string) => void
}

/** Slimme lijst opslaan, hernoemen of verwijderen. */
export function WishlistListSheet({ list, filters, existing, onClose, onSaved, onDeleted }: Props): JSX.Element {
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
      onSaved(list ? await updateWishlistList(list.id, { name }) : await addWishlistList(name, filters, existing.length))
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
    <Sheet title={list ? `List: ${list.name}` : 'Save as list'} onClose={onClose}>
      <form className="sheet-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Name
          <input value={name} maxLength={MAX_LIST_NAME} placeholder="e.g. Under €10" onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <p className="muted small">Shows: {describeWishFilters(list?.filters ?? filters)}</p>
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
