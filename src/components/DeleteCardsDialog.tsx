import { useState, type FormEvent, type JSX } from 'react'
import { deleteCards } from '../lib/db'
import { errorText } from '../lib/errors'
import type { Card } from '../lib/types'
import { Sheet } from './Sheet'

/** Vanaf zoveel kaarten (of bij alles in het filter) moet je DELETE typen. */
export const TYPE_TO_CONFIRM = 10
const WORD = 'DELETE'

interface Props {
  cards: Card[]
  /** Alle kaarten in het huidige filter geselecteerd ("Delete all"). */
  all: boolean
  onClose: () => void
  /** Verwijderde id's (ook bij een fout halverwege) en eventuele foutmelding. */
  onDeleted: (ids: string[], error: string | null) => void
}

/** Geselecteerde kaarten verwijderen, met bevestiging; niet ongedaan te maken. */
export function DeleteCardsDialog({ cards, all, onClose, onDeleted }: Props): JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const n = cards.length
  const mustType = all || n >= TYPE_TO_CONFIRM
  const ready = !mustType || typed.trim().toUpperCase() === WORD
  const inTrades = cards.filter((c) => c.ownership !== 'owned' && c.ownership !== 'incoming').length

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy || !ready || n === 0) return
    setBusy(true)
    const ids = cards.map((c) => c.id)
    let done = 0
    try {
      await deleteCards(ids, (d) => {
        done = d
        setProgress(`Deleted ${d} of ${n}…`)
      })
      onDeleted(ids, null)
    } catch (err) {
      onDeleted(ids.slice(0, done), `${errorText(err, 'Deleting failed.')} ${done} of ${n} cards were deleted.`)
    }
  }

  return (
    <Sheet title={all ? `Delete all ${n} cards` : `Delete ${n} ${n === 1 ? 'card' : 'cards'}`} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        <p>
          {n === 1 ? 'This card is' : `These ${n} cards are`} removed from your collection, with their valuations. <strong>This cannot be undone.</strong>
        </p>
        <p className="muted small">
          Purchases and sales stay under Trades, without the link to the card{inTrades > 0 ? ` (${inTrades} of these cards are sold or traded)` : ''}.
        </p>
        <a className="button-link" href="#/backup">
          Make a backup first
        </a>
        {mustType && (
          <label>
            Type {WORD} to confirm
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} />
          </label>
        )}
        {progress && <p aria-live="polite">{progress}</p>}
        <footer className="sheet-foot">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={busy || !ready}>
            {busy ? 'Deleting…' : `Delete ${n} ${n === 1 ? 'card' : 'cards'}`}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
