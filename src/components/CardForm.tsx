import { useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { deleteCard, insertCard, splitCard, updateCard } from '../lib/db'
import type { Candidate } from '../lib/match'
import { addedQuietly, celebrateAdded } from '../lib/celebrate'
import { getSet, lookupLang, type Lang } from '../lib/tcgdex'
import {
  AVAILABILITY_LABELS,
  CONDITION_LABELS,
  EMPTY_CARD,
  GRADING_LABELS,
  LANGUAGE_LABELS,
  OWNERSHIP_LABELS,
  STATUS_LABELS,
  VARIANT_LABELS,
  deriveStatus,
  fromStatus,
  isHeld,
  statusBadge,
  type Availability,
  type Card,
  type CardInput,
  type CardStatus,
  type Ownership,
  type Variant,
} from '../lib/types'
import { useCardInfo } from '../hooks/useCardInfo'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { LinkPicker } from './LinkPicker'
import { MAX_QTY, initialState, today, validate, type FormState } from '../lib/cardForm'
import { errorText } from '../lib/errors'

interface Props {
  /** Bestaande regel, of null voor een nieuwe. */
  card: Card | null
  /** Startwaarden: de bestaande regel of vooraf ingevulde velden (scan). */
  source: CardInput | null
  /** Status bij openen (bv. "List for sale" vanuit de weergave). */
  startStatus: CardStatus
  nextSortOrder: number
  onCancel: () => void
  onSaved: (rows: Card[]) => void
  onDeleted: (id: string) => void
  /** Nieuwe kaart uit een scan: na opslaan geen vieringen (zie addedQuietly). */
  quietAdd?: boolean
}

function Select<K extends string>({
  label,
  value,
  options,
  onChange,
  empty = 'Unknown',
  allowed = null,
  required = false,
}: {
  label: string
  value: K | ''
  options: Record<K, string>
  onChange: (v: K | '') => void
  empty?: string
  /** Alleen deze keuzes tonen (bv. uitvoeringen volgens de catalogus); een afwijkende huidige waarde blijft zichtbaar. */
  allowed?: readonly K[] | null
  /** Geen lege keuze tonen. */
  required?: boolean
}): JSX.Element {
  const keys = (Object.keys(options) as K[]).filter((k) => !allowed || allowed.includes(k) || k === value)
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as K | '')}>
        {!required && <option value="">{empty}</option>}
        {keys.map((k) => (
          <option key={k} value={k}>
            {allowed && !allowed.includes(k) ? `${options[k]} (not in catalog)` : options[k]}
          </option>
        ))}
      </select>
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="form-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

export function CardForm({
  card,
  source,
  startStatus,
  nextSortOrder,
  onCancel,
  onSaved,
  onDeleted,
  quietAdd = false,
}: Props): JSX.Element {
  const [form, setForm] = useState<FormState>(() => initialState(source, startStatus))
  const [splitQty, setSplitQty] = useState(String(card?.quantity ?? 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))

  // Status wijzigen bij een regel met meerdere stuks → vragen hoeveel er meegaan.
  const canSplit =
    card !== null && card.quantity > 1 && (form.ownership !== card.ownership || form.availability !== card.availability)
  const formStatus = deriveStatus(form.ownership, form.availability)
  // Snelkeuze actief alleen bij de drie gewone combinaties (niet bij onderweg, gereserveerd, geruild of weggegeven).
  const plain = (form.ownership === 'owned' && form.availability !== 'reserved') || form.ownership === 'sold'
  const isCard = form.kind === 'card'

  // Uitvoeringen die volgens TCGdex bestaan voor de gekoppelde kaart (bv. een ex-kaart: alleen holo).
  const info = useCardInfo(isCard ? form.tcgdex_id : null)
  // Nieuwe velden pas tonen als de database ze kan opslaan (STAP4).
  const v2 = useSchemaV2() === true
  // Met transacties (STAP5) verkoop je via "Sell", zodat opbrengst en kosten worden vastgelegd.
  const salesTracked = useTransactionsEnabled() === true
  const wasSold = card?.ownership === 'sold'
  const sellViaDialog = salesTracked && !wasSold
  const statusOptions = (Object.keys(STATUS_LABELS) as CardStatus[]).filter((s) => !(sellViaDialog && s === 'sold'))
  const ownershipOptions: Ownership[] | null = sellViaDialog ? ['incoming', 'owned', 'traded', 'given_away'] : null
  const allowedVariants = info?.variants ?? null
  const variantMismatch = form.variant !== '' && allowedVariants !== null && !allowedVariants.includes(form.variant)

  function changeOwnership(ownership: Ownership, availability?: Availability): void {
    setForm((f) => ({
      ...f,
      ownership,
      availability: availability ?? (isHeld(ownership) ? f.availability : 'keep'),
      sale_date: ownership === 'sold' && !f.sale_date ? today() : f.sale_date,
    }))
  }

  /** Snelkeuze: de drie meest gebruikte combinaties. */
  function changeStatus(status: CardStatus): void {
    const next = fromStatus(status)
    changeOwnership(next.ownership, next.availability)
  }

  async function onPick(c: Candidate, lang: Lang): Promise<void> {
    const number = /^\d+$/.test(c.localId) ? String(Number.parseInt(c.localId, 10)) : c.localId
    setForm((f) => ({
      ...f,
      tcgdex_id: c.key,
      link_status: 'manual',
      card_number: number,
      // Aziatische kaart gekozen terwijl de taal Europees staat → taal meenemen.
      language: lookupLang(f.language || null) === lang ? f.language : lang,
    }))
    try {
      const setInfo = await getSet(lang, c.setId)
      set('set_code', setInfo?.summary.abbr ?? c.setId)
    } catch (err) {
      console.error('Setinfo ophalen mislukt', err)
      set('set_code', c.setId)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const result = validate(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    let moved = 0
    if (canSplit && card) {
      moved = Number(splitQty)
      if (!Number.isInteger(moved) || moved < 1 || moved > card.quantity) {
        setError(`Choose how many of the ${card.quantity} to move (1 to ${card.quantity}).`)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      if (card && canSplit && moved < card.quantity) {
        const { original, created } = await splitCard(card, moved, { ...card, ...result.value })
        onSaved([original, created])
      } else if (card) {
        onSaved([await updateCard(card.id, result.value)])
      } else {
        const created = await insertCard({ ...EMPTY_CARD, ...source, ...result.value, sort_order: nextSortOrder })
        onSaved([created])
        void (quietAdd ? addedQuietly([created]) : celebrateAdded([created]))
      }
    } catch (err) {
      setError(errorText(err, 'Saving failed.'))
      setBusy(false)
    }
  }

  async function onDelete(): Promise<void> {
    if (!card || busy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await deleteCard(card.id)
      onDeleted(card.id)
    } catch (err) {
      setError(errorText(err, 'Deleting failed.'))
      setBusy(false)
    }
  }

  return (
    <form className="card-form" onSubmit={onSubmit} noValidate>
      <div className="segmented status-switch" role="radiogroup" aria-label="Status">
        {statusOptions.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={plain && formStatus === s} onClick={() => changeStatus(s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {canSplit && card && (
        <label className="split">
          How many of the {card.quantity}?
          <input type="number" min={1} max={card.quantity} value={splitQty} onChange={(e) => setSplitQty(e.target.value)} />
          <span className="muted small">The rest stays "{statusBadge(card) ?? 'Owned'}".</span>
        </label>
      )}

      {v2 && (
        <div className="form-grid">
          <Select
            label="Ownership"
            value={form.ownership}
            options={OWNERSHIP_LABELS}
            allowed={ownershipOptions}
            required
            onChange={(v) => v && changeOwnership(v)}
          />
          {isHeld(form.ownership) && (
            <Select
              label="Availability"
              value={form.availability}
              options={AVAILABILITY_LABELS}
              required
              onChange={(v) => v && set('availability', v)}
            />
          )}
        </div>
      )}
      {sellViaDialog && (
        <p className="muted small">To record a sale, use "Mark as sold" in the card view or select cards in Collection.</p>
      )}

      <Group title="Card">
        <label>
          Name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required />
        </label>
        <div className="form-grid">
          {isCard && (
            <>
              <label>
                Set
                <input value={form.set_code} onChange={(e) => set('set_code', e.target.value)} maxLength={20} placeholder="MEW" />
              </label>
              <label>
                Number
                <input value={form.card_number} onChange={(e) => set('card_number', e.target.value)} maxLength={20} />
              </label>
            </>
          )}
          <label>
            Quantity
            <input
              type="number"
              min={1}
              max={MAX_QTY}
              step={1}
              value={form.quantity}
              disabled={canSplit}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </label>
          {isCard && (
            <>
              <Select label="Language" value={form.language} options={LANGUAGE_LABELS} onChange={(v) => set('language', v)} />
              <Select
                label="Variant"
                value={form.variant}
                options={VARIANT_LABELS}
                allowed={allowedVariants}
                onChange={(v) => set('variant', v)}
              />
            </>
          )}
          <Select label="Condition" value={form.condition} options={CONDITION_LABELS} onChange={(v) => set('condition', v)} />
          {isCard && (
            <Select
              label="Graded"
              value={form.grading_company}
              options={GRADING_LABELS}
              empty="No"
              onChange={(v) => setForm((f) => ({ ...f, grading_company: v, grade: v ? f.grade : '' }))}
            />
          )}
          {isCard && form.grading_company && (
            <>
              <label>
                Grade
                <input inputMode="decimal" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="10" />
              </label>
              {v2 && (
                <label>
                  Certificate no.
                  <input value={form.cert_number} onChange={(e) => set('cert_number', e.target.value)} maxLength={40} />
                </label>
              )}
            </>
          )}
          {isCard && v2 && (
            <label>
              Edition or stamp
              <input value={form.edition} onChange={(e) => set('edition', e.target.value)} maxLength={60} placeholder="e.g. Staff stamp" />
            </label>
          )}
        </div>
        {isCard && variantMismatch && (
          <p className="notice small" role="status">
            The catalog (TCGdex) does not list {VARIANT_LABELS[form.variant as Variant]} for this card
            {allowedVariants && `; it exists as ${allowedVariants.map((v) => VARIANT_LABELS[v]).join(', ')}`}.
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={!isCard} onChange={(e) => set('kind', e.target.checked ? 'sealed' : 'card')} />
          Sealed product
        </label>
      </Group>

      <Group title="Purchase">
        <div className="form-grid">
          <label>
            Price (€)
            <input inputMode="decimal" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0.00" />
          </label>
          <label>
            Date
            <input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
          </label>
        </div>
      </Group>

      {formStatus !== 'collection' && form.ownership !== 'traded' && form.ownership !== 'given_away' && (
        <Group title={form.ownership === 'sold' ? 'Sale' : 'For sale'}>
          <div className="form-grid">
            <label>
              {form.ownership === 'sold' ? 'Sold for (€)' : 'Asking (€)'}
              <input inputMode="decimal" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} placeholder="0.00" />
            </label>
            {form.ownership === 'sold' && (
              <label>
                Date
                <input type="date" value={form.sale_date} onChange={(e) => set('sale_date', e.target.value)} />
              </label>
            )}
          </div>
        </Group>
      )}

      {isCard && (
        <Group title="Linked card">
          <LinkPicker
            name={form.name}
            language={form.language || null}
            setCode={form.set_code}
            cardNumber={form.card_number}
            value={form.tcgdex_id}
            onSelect={(c, lang) => void onPick(c, lang)}
            onClear={() => setForm((f) => ({ ...f, tcgdex_id: null, link_status: null }))}
          />
        </Group>
      )}

      {v2 && (
        <label>
          Notes
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} rows={2} />
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="sheet-foot">
        {card && (
          <button type="button" className={confirmDelete ? 'danger' : 'ghost danger-text'} onClick={() => void onDelete()} disabled={busy}>
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </form>
  )
}
