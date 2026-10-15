import { useState, type FormEvent, type JSX } from 'react'
import { updateCard } from '../lib/db'
import type { Location } from '../lib/binder'
import {
  AVAILABILITY_LABELS,
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  VARIANT_LABELS,
  type Availability,
  type Card,
  type CardInput,
  type CardLanguage,
  type Condition,
  type Variant,
} from '../lib/types'
import { Sheet } from './Sheet'

/** Eén wijziging met de oude waarden, om ongedaan te kunnen maken. */
export interface BulkChange {
  id: string
  before: Partial<CardInput>
}

interface Props {
  cards: Card[]
  locations: readonly Location[]
  onClose: () => void
  /** Bijgewerkte kaarten en de wijzigingen (ook bij een gedeeltelijke fout). */
  onApplied: (rows: Card[], changes: BulkChange[], error: string | null) => void
}

const KEEP = 'keep'
const CLEAR = 'clear'

/** Meerdere kaarten tegelijk wijzigen; alleen de velden die je kiest, de rest blijft zoals het is. */
export function BulkEditDialog({ cards, locations, onClose, onApplied }: Props): JSX.Element {
  const [language, setLanguage] = useState<string>(KEEP)
  const [condition, setCondition] = useState<string>(KEEP)
  const [variant, setVariant] = useState<string>(KEEP)
  const [availability, setAvailability] = useState<string>(KEEP)
  const [location, setLocation] = useState<string>(KEEP)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const allOwned = cards.every((c) => c.ownership === 'owned' || c.ownership === 'incoming')

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const patch: Partial<CardInput> = {}
    if (language !== KEEP) patch.language = language === CLEAR ? null : (language as CardLanguage)
    if (condition !== KEEP) patch.condition = condition === CLEAR ? null : (condition as Condition)
    if (variant !== KEEP) patch.variant = variant === CLEAR ? null : (variant as Variant)
    if (location !== KEEP) {
      patch.location_id = location === CLEAR ? null : location
      // Andere map: oude pagina/vak klopt niet meer.
      patch.location_page = null
      patch.location_slot = null
    }
    const changeAvailability = availability !== KEEP && allOwned
    if (Object.keys(patch).length === 0 && !changeAvailability) {
      onClose()
      return
    }
    setBusy(true)
    const rows: Card[] = []
    const changes: BulkChange[] = []
    let error: string | null = null
    for (const [i, c] of cards.entries()) {
      setProgress(`Saving ${i + 1} of ${cards.length}…`)
      const full: Partial<CardInput> = { ...patch }
      // Beschikbaarheid altijd samen met bezit sturen, zodat de afgeleide status klopt.
      if (changeAvailability) Object.assign(full, { ownership: c.ownership, availability: availability as Availability })
      const before = Object.fromEntries(Object.keys(full).map((k) => [k, c[k as keyof CardInput]])) as Partial<CardInput>
      try {
        rows.push(await updateCard(c.id, full))
        changes.push({ id: c.id, before })
      } catch (err) {
        error = `${c.name}: ${err instanceof Error ? err.message : 'saving failed'}. ${changes.length} of ${cards.length} cards were changed.`
        break
      }
    }
    onApplied(rows, changes, error)
  }

  const select = (label: string, value: string, set: (v: string) => void, options: Record<string, string>, canClear = true): JSX.Element => (
    <label>
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} disabled={busy}>
        <option value={KEEP}>Keep as is</option>
        {canClear && <option value={CLEAR}>Clear (unknown)</option>}
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Sheet title={`Edit ${cards.length} cards`} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        <p className="muted small">Only the fields you change are updated. You can undo this afterwards.</p>
        <div className="form-grid">
          {select('Language', language, setLanguage, LANGUAGE_LABELS)}
          {select('Condition', condition, setCondition, CONDITION_LABELS)}
          {select('Variant', variant, setVariant, VARIANT_LABELS)}
          {allOwned && select('Availability', availability, setAvailability, AVAILABILITY_LABELS, false)}
          {locations.length > 0 &&
            select('Location', location, setLocation, Object.fromEntries(locations.map((l) => [l.id, l.name])))}
        </div>
        {progress && <p aria-live="polite">{progress}</p>}
        <footer className="sheet-foot">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : `Apply to ${cards.length} cards`}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
