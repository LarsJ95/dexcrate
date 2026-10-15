import { useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { deleteCard, insertCard, splitCard, updateCard } from '../lib/db'
import { normalizeChannel, parsePrice } from '../lib/excel'
import type { Candidate } from '../lib/match'
import { getSet, lookupLang, type Lang } from '../lib/tcgdex'
import {
  CONDITION_LABELS,
  GRADING_LABELS,
  LANGUAGE_LABELS,
  STATUS_LABELS,
  VARIANT_LABELS,
  type Card,
  type CardInput,
  type CardLanguage,
  type CardStatus,
  type Condition,
  type GradingCompany,
  type ItemKind,
  type Variant,
} from '../lib/types'
import { useCardInfo } from '../hooks/useCardInfo'
import { LinkPicker } from './LinkPicker'

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
}

interface FormState {
  name: string
  set_code: string
  card_number: string
  quantity: string
  kind: ItemKind
  tcgdex_id: string | null
  status: CardStatus
  language: CardLanguage | ''
  condition: Condition | ''
  variant: Variant | ''
  grading_company: GradingCompany | ''
  grade: string
  purchase_price: string
  purchase_channel: string
  purchase_date: string
  sale_price: string
  sale_channel: string
  sale_date: string
}

const MAX_QTY = 9999
const MAX_PRICE = 1_000_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const priceText = (n: number | null): string => (n === null ? '' : n.toFixed(2))
const today = (): string => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in lokale tijd

function initialState(src: CardInput | null, status: CardStatus): FormState {
  return {
    name: src?.name ?? '',
    set_code: src?.set_code ?? '',
    card_number: src?.card_number ?? '',
    quantity: String(src?.quantity ?? 1),
    kind: src?.kind ?? 'card',
    tcgdex_id: src?.tcgdex_id ?? null,
    status,
    language: src ? (src.language ?? '') : 'en',
    condition: src?.condition ?? '',
    variant: src?.variant ?? '',
    grading_company: src?.grading_company ?? '',
    grade: src?.grade === null || src?.grade === undefined ? '' : String(src.grade),
    purchase_price: priceText(src?.purchase_price ?? null),
    purchase_channel: src?.purchase_channel ?? '',
    purchase_date: src?.purchase_date ?? '',
    sale_price: priceText(src?.sale_price ?? null),
    sale_channel: src?.sale_channel ?? '',
    sale_date: status === 'sold' && !src?.sale_date ? today() : (src?.sale_date ?? ''),
  }
}

// Foto wordt niet in het formulier bewerkt; bij bijwerken blijft image_path ongemoeid.
type Validated = { error: string } | { value: Omit<CardInput, 'sort_order' | 'image_path'> }

function optionalPrice(raw: string, label: string): { error: string } | { value: number | null } {
  if (!raw.trim()) return { value: null }
  const p = parsePrice(raw)
  if (p === null || p > MAX_PRICE) return { error: `Enter a valid ${label}, e.g. 4.95.` }
  return { value: p }
}

function validate(f: FormState): Validated {
  const name = f.name.trim()
  if (!name) return { error: 'Enter a name.' }
  if (name.length > 200) return { error: 'Name is too long (max. 200 characters).' }
  const qty = Number(f.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `Quantity must be a whole number from 1 to ${MAX_QTY}.` }
  const setCode = f.set_code.trim()
  const number = f.card_number.trim()
  if (setCode.length > 20 || number.length > 20) return { error: 'Set and number can be at most 20 characters.' }

  const purchase = optionalPrice(f.purchase_price, 'purchase price')
  if ('error' in purchase) return purchase
  const sale = optionalPrice(f.sale_price, f.status === 'sold' ? 'sale price' : 'asking price')
  if ('error' in sale) return sale
  if (f.status !== 'collection' && sale.value === null) {
    return { error: f.status === 'sold' ? 'Enter the sale price.' : 'Enter an asking price.' }
  }

  let grade: number | null = null
  if (f.grading_company || f.grade.trim()) {
    grade = Number(f.grade.replace(',', '.'))
    if (!f.grading_company) return { error: 'Choose the grading company.' }
    if (!f.grade.trim() || !Number.isFinite(grade) || grade < 1 || grade > 10 || (grade * 2) % 1 !== 0) {
      return { error: 'Grade must be between 1 and 10 (half points allowed).' }
    }
  }

  for (const d of [f.purchase_date, f.sale_date]) {
    if (d && !DATE_RE.test(d)) return { error: 'Invalid date.' }
  }
  const purchaseChannel = normalizeChannel(f.purchase_channel)
  const saleChannel = normalizeChannel(f.sale_channel)
  if ((purchaseChannel?.length ?? 0) > 50 || (saleChannel?.length ?? 0) > 50) return { error: 'Channel is too long (max. 50 characters).' }

  const sealed = f.kind === 'sealed'
  const hasSale = f.status !== 'collection'
  return {
    value: {
      name,
      set_code: sealed || !setCode ? null : setCode,
      card_number: sealed || !number ? null : number,
      quantity: qty,
      kind: f.kind,
      tcgdex_id: sealed ? null : f.tcgdex_id,
      status: f.status,
      language: sealed ? null : f.language || null,
      condition: f.condition || null,
      variant: sealed ? null : f.variant || null,
      grading_company: sealed ? null : f.grading_company || null,
      grade: sealed ? null : grade,
      purchase_price: purchase.value,
      purchase_channel: purchaseChannel,
      purchase_date: f.purchase_date || null,
      // Verkoopgegevens alleen bewaren als de kaart te koop staat of verkocht is.
      sale_price: hasSale ? sale.value : null,
      sale_channel: hasSale ? saleChannel : null,
      sale_date: f.status === 'sold' ? f.sale_date || null : null,
    },
  }
}

function Select<K extends string>({
  label,
  value,
  options,
  onChange,
  empty = 'Unknown',
  allowed = null,
}: {
  label: string
  value: K | ''
  options: Record<K, string>
  onChange: (v: K | '') => void
  empty?: string
  /** Alleen deze keuzes tonen (bv. uitvoeringen volgens de catalogus); een afwijkende huidige waarde blijft zichtbaar. */
  allowed?: readonly K[] | null
}): JSX.Element {
  const keys = (Object.keys(options) as K[]).filter((k) => !allowed || allowed.includes(k) || k === value)
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as K | '')}>
        <option value="">{empty}</option>
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
}: Props): JSX.Element {
  const [form, setForm] = useState<FormState>(() => initialState(source, startStatus))
  const [splitQty, setSplitQty] = useState(String(card?.quantity ?? 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))

  // Status wijzigen bij een regel met meerdere stuks → vragen hoeveel er meegaan.
  const canSplit = card !== null && card.quantity > 1 && form.status !== card.status
  const isCard = form.kind === 'card'

  // Uitvoeringen die volgens TCGdex bestaan voor de gekoppelde kaart (bv. een ex-kaart: alleen holo).
  const info = useCardInfo(isCard ? form.tcgdex_id : null)
  const allowedVariants = info?.variants ?? null
  const variantMismatch = form.variant !== '' && allowedVariants !== null && !allowedVariants.includes(form.variant)
  const onlyVariant = allowedVariants?.length === 1 ? allowedVariants[0] : null

  function changeStatus(status: CardStatus): void {
    setForm((f) => ({ ...f, status, sale_date: status === 'sold' && !f.sale_date ? today() : f.sale_date }))
  }

  async function onPick(c: Candidate, lang: Lang): Promise<void> {
    const number = /^\d+$/.test(c.localId) ? String(Number.parseInt(c.localId, 10)) : c.localId
    setForm((f) => ({
      ...f,
      tcgdex_id: c.key,
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
        const { original, created } = await splitCard(card, moved, { ...result.value, image_path: card.image_path, sort_order: card.sort_order })
        onSaved([original, created])
      } else if (card) {
        onSaved([await updateCard(card.id, result.value)])
      } else {
        onSaved([await insertCard({ ...result.value, image_path: source?.image_path ?? null, sort_order: nextSortOrder })])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
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
      setError(err instanceof Error ? err.message : 'Deleting failed.')
      setBusy(false)
    }
  }

  return (
    <form className="card-form" onSubmit={onSubmit} noValidate>
      <div className="segmented status-switch" role="radiogroup" aria-label="Status">
        {(Object.keys(STATUS_LABELS) as CardStatus[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={form.status === s} onClick={() => changeStatus(s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {canSplit && card && (
        <label className="split">
          How many of the {card.quantity}?
          <input type="number" min={1} max={card.quantity} value={splitQty} onChange={(e) => setSplitQty(e.target.value)} />
          <span className="muted small">The rest stays "{STATUS_LABELS[card.status]}".</span>
        </label>
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
            <label>
              Grade
              <input inputMode="decimal" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="10" />
            </label>
          )}
        </div>
        {isCard && variantMismatch && (
          <p className="notice small" role="status">
            The catalog (TCGdex) does not list {VARIANT_LABELS[form.variant as Variant]} for this card
            {allowedVariants && `; it exists as ${allowedVariants.map((v) => VARIANT_LABELS[v]).join(', ')}`}.
          </p>
        )}
        {isCard && onlyVariant && form.variant !== onlyVariant && (
          <p className="small muted">
            This card only exists as {VARIANT_LABELS[onlyVariant]}.{' '}
            <button type="button" className="ghost small-btn" onClick={() => set('variant', onlyVariant)}>
              Set to {VARIANT_LABELS[onlyVariant]}
            </button>
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

      {form.status !== 'collection' && (
        <Group title={form.status === 'sold' ? 'Sale' : 'For sale'}>
          <div className="form-grid">
            <label>
              {form.status === 'sold' ? 'Sold for (€)' : 'Asking (€)'}
              <input inputMode="decimal" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} placeholder="0.00" />
            </label>
            {form.status === 'sold' && (
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
            onClear={() => set('tcgdex_id', null)}
          />
        </Group>
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
