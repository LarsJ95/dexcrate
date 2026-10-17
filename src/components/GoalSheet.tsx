import { useState, type FormEvent, type JSX } from 'react'
import type { GoalSettings } from '../lib/goals'
import type { Lang } from '../lib/tcgdex'
import { LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Variant } from '../lib/types'
import { saveGoal } from '../lib/wishlist'
import { Sheet } from './Sheet'
import { errorText } from '../lib/errors'

interface Props {
  lang: Lang
  setId: string
  setName: string
  goal: GoalSettings
  onClose: () => void
  onSaved: (goal: GoalSettings) => void
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Instellen wat meetelt voor "compleet" bij deze set. */
export function GoalSheet({ lang, setId, setName, goal, onClose, onSaved }: Props): JSX.Element {
  const [draft, setDraft] = useState<GoalSettings>(goal)
  const [qty, setQty] = useState(String(goal.wantedQty))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const q = Number(qty)
    if (!Number.isInteger(q) || q < 1 || q > 99) {
      setError('Copies per card must be 1 to 99.')
      return
    }
    const next = { ...draft, wantedQty: q }
    setBusy(true)
    setError(null)
    try {
      await saveGoal(lang, setId, next)
      onSaved(next)
    } catch (err) {
      setError(errorText(err, 'Saving the goal failed.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Goal for ${setName}`} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        <fieldset className="form-group">
          <legend>Versions that count separately</legend>
          <p className="muted small">None selected: any version of a card completes it. Only versions that exist for a card are counted.</p>
          <div className="check-grid">
            {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
              <label key={v} className="check">
                <input type="checkbox" checked={draft.variants.includes(v)} onChange={() => setDraft((d) => ({ ...d, variants: toggle(d.variants, v) }))} />
                {VARIANT_LABELS[v]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-group">
          <legend>Languages that count</legend>
          <p className="muted small">None selected: any language counts.</p>
          <div className="check-grid">
            {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
              <label key={l} className="check">
                <input type="checkbox" checked={draft.languages.includes(l)} onChange={() => setDraft((d) => ({ ...d, languages: toggle(d.languages, l) }))} />
                {LANGUAGE_LABELS[l]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-group">
          <legend>Other</legend>
          <div className="form-grid">
            <label>
              Copies per card
              <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={draft.includeSecret} onChange={(e) => setDraft((d) => ({ ...d, includeSecret: e.target.checked }))} />
            Include secret rares (numbers above the official count)
          </label>
          <label className="check">
            <input type="checkbox" checked={draft.includeIncoming} onChange={(e) => setDraft((d) => ({ ...d, includeIncoming: e.target.checked }))} />
            Count incoming cards as owned
          </label>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <footer className="sheet-foot">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save goal'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
