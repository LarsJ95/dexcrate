import { useEffect, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { deleteCard, insertCard, splitCard, updateCard } from '../lib/db'
import { normalizeChannel, parsePrice } from '../lib/excel'
import type { Candidate } from '../lib/match'
import { getSet, lookupLang, type Lang } from '../lib/tcgdex'
import {
  CONDITION_LABELS,
  EMPTY_CARD,
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
import { CardImage } from './CardImage'
import { LinkPicker } from './LinkPicker'
import { PriceHistory } from './PriceHistory'

interface Props {
  card: Card | null
  /** Vooraf ingevulde velden voor een nieuwe kaart (bv. uit een scan). */
  initial?: Partial<CardInput>
  defaultStatus: CardStatus
  channels: readonly string[]
  nextSortOrder: number
  onClose: () => void
  /** Gewijzigde en/of nieuwe regels (meer dan één bij splitsen). */
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

const priceText = (n: number | null): string => (n === null ? '' : n.toFixed(2).replace('.', ','))
const today = (): string => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in lokale tijd

function initialState(card: CardInput | null, defaultStatus: CardStatus): FormState {
  return {
    name: card?.name ?? '',
    set_code: card?.set_code ?? '',
    card_number: card?.card_number ?? '',
    quantity: String(card?.quantity ?? 1),
    kind: card?.kind ?? 'card',
    tcgdex_id: card?.tcgdex_id ?? null,
    status: card?.status ?? defaultStatus,
    language: card ? (card.language ?? '') : 'en',
    condition: card?.condition ?? '',
    variant: card?.variant ?? '',
    grading_company: card?.grading_company ?? '',
    grade: card?.grade === null || card?.grade === undefined ? '' : String(card.grade).replace('.', ','),
    purchase_price: priceText(card?.purchase_price ?? null),
    purchase_channel: card?.purchase_channel ?? '',
    purchase_date: card?.purchase_date ?? '',
    sale_price: priceText(card?.sale_price ?? null),
    sale_channel: card?.sale_channel ?? '',
    sale_date: card?.sale_date ?? '',
  }
}

type Validated = { error: string } | { value: Omit<CardInput, 'sort_order'> }

function optionalPrice(raw: string, label: string): { error: string } | { value: number | null } {
  if (!raw.trim()) return { value: null }
  const p = parsePrice(raw)
  if (p === null || p > MAX_PRICE) return { error: `Vul een geldige ${label} in, bijvoorbeeld 4,95.` }
  return { value: p }
}

function validate(f: FormState): Validated {
  const name = f.name.trim()
  if (!name) return { error: 'Vul een naam in.' }
  if (name.length > 200) return { error: 'Naam is te lang (max. 200 tekens).' }
  const qty = Number(f.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `Aantal moet een heel getal zijn van 1 tot ${MAX_QTY}.` }
  const setCode = f.set_code.trim()
  const number = f.card_number.trim()
  if (setCode.length > 20 || number.length > 20) return { error: 'Set en nummer mogen maximaal 20 tekens zijn.' }

  const purchase = optionalPrice(f.purchase_price, 'aankoopprijs')
  if ('error' in purchase) return purchase
  const sale = optionalPrice(f.sale_price, f.status === 'sold' ? 'verkoopprijs' : 'vraagprijs')
  if ('error' in sale) return sale
  if (f.status !== 'collection' && sale.value === null) {
    return { error: f.status === 'sold' ? 'Vul de verkoopprijs in.' : 'Vul een vraagprijs in.' }
  }

  let grade: number | null = null
  if (f.grading_company || f.grade.trim()) {
    grade = Number(f.grade.replace(',', '.'))
    if (!f.grading_company) return { error: 'Kies het grading-bedrijf bij het cijfer.' }
    if (!f.grade.trim() || !Number.isFinite(grade) || grade < 1 || grade > 10 || (grade * 2) % 1 !== 0) {
      return { error: 'Grade moet tussen 1 en 10 liggen (halve punten mogen).' }
    }
  }

  for (const d of [f.purchase_date, f.sale_date]) {
    if (d && !DATE_RE.test(d)) return { error: 'Ongeldige datum.' }
  }
  const purchaseChannel = normalizeChannel(f.purchase_channel)
  const saleChannel = normalizeChannel(f.sale_channel)
  if ((purchaseChannel?.length ?? 0) > 50 || (saleChannel?.length ?? 0) > 50) return { error: 'Kanaal is te lang (max. 50 tekens).' }

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
  empty = 'Onbekend',
}: {
  label: string
  value: K | ''
  options: Record<K, string>
  onChange: (v: K | '') => void
  empty?: string
}): JSX.Element {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as K | '')}>
        <option value="">{empty}</option>
        {(Object.keys(options) as K[]).map((k) => (
          <option key={k} value={k}>{options[k]}</option>
        ))}
      </select>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

export function CardDialog({
  card,
  initial,
  defaultStatus,
  channels,
  nextSortOrder,
  onClose,
  onSaved,
  onDeleted,
}: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormState>(() =>
    initialState(card ?? (initial ? { ...EMPTY_CARD, status: defaultStatus, ...initial } : null), defaultStatus),
  )
  const [splitQty, setSplitQty] = useState(String(card?.quantity ?? 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))

  // Status wijzigen bij een regel met meerdere stuks → vragen hoeveel er meegaan.
  const canSplit = card !== null && card.quantity > 1 && form.status !== card.status

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
        setError(`Kies hoeveel van de ${card.quantity} stuks je wilt verplaatsen (1 tot ${card.quantity}).`)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      if (card && canSplit && moved < card.quantity) {
        const { original, created } = await splitCard(card, moved, { ...result.value, sort_order: card.sort_order })
        onSaved([original, created])
      } else if (card) {
        onSaved([await updateCard(card.id, result.value)])
      } else {
        onSaved([await insertCard({ ...result.value, sort_order: nextSortOrder })])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
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
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
      setBusy(false)
    }
  }

  const isCard = form.kind === 'card'

  return (
    <dialog ref={ref} className="item-dialog" onClose={onClose} aria-labelledby="card-dialog-title">
      <form onSubmit={onSubmit} noValidate>
        <header className="dialog-head">
          <h2 id="card-dialog-title">{card ? card.name : 'Kaart toevoegen'}</h2>
          <button type="button" className="ghost icon" onClick={() => ref.current?.close()} aria-label="Sluiten">
            ✕
          </button>
        </header>

        <div className="segmented status-switch" role="radiogroup" aria-label="Status">
          {(Object.keys(STATUS_LABELS) as CardStatus[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={form.status === s} onClick={() => changeStatus(s)}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {canSplit && card && (
          <label className="split">
            Hoeveel van de {card.quantity} stuks zet je op "{STATUS_LABELS[form.status]}"?
            <input
              type="number"
              min={1}
              max={card.quantity}
              value={splitQty}
              onChange={(e) => setSplitQty(e.target.value)}
            />
            <span className="muted small">De rest blijft "{STATUS_LABELS[card.status]}".</span>
          </label>
        )}

        <div className="dialog-body">
          <div className="dialog-preview">
            <CardImage tcgdexId={isCard ? form.tcgdex_id : null} kind={form.kind} name={form.name || 'Nieuwe kaart'} quality="high" />
          </div>

          <div className="fields">
            <fieldset className="kind-switch">
              <legend>Soort</legend>
              <label>
                <input type="radio" name="kind" checked={isCard} onChange={() => set('kind', 'card')} /> Losse kaart
              </label>
              <label>
                <input type="radio" name="kind" checked={!isCard} onChange={() => set('kind', 'sealed')} /> Sealed product
              </label>
            </fieldset>

            <label>
              Naam
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required />
            </label>

            {isCard && (
              <div className="row-3">
                <label>
                  Set
                  <input value={form.set_code} onChange={(e) => set('set_code', e.target.value)} maxLength={20} placeholder="bv. MEW" />
                </label>
                <label>
                  Nummer
                  <input value={form.card_number} onChange={(e) => set('card_number', e.target.value)} maxLength={20} />
                </label>
                <label>
                  Aantal
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
              </div>
            )}
            {!isCard && (
              <label>
                Aantal
                <input type="number" min={1} max={MAX_QTY} step={1} value={form.quantity} disabled={canSplit} onChange={(e) => set('quantity', e.target.value)} />
              </label>
            )}

            {isCard && (
              <div className="row-2">
                <Select label="Taal" value={form.language} options={LANGUAGE_LABELS} onChange={(v) => set('language', v)} />
                <Select label="Variant" value={form.variant} options={VARIANT_LABELS} onChange={(v) => set('variant', v)} />
              </div>
            )}
            <div className="row-2">
              <Select label="Conditie" value={form.condition} options={CONDITION_LABELS} onChange={(v) => set('condition', v)} />
              {isCard && (
                <div className="grading">
                  <Select
                    label="Gegradeerd"
                    value={form.grading_company}
                    options={GRADING_LABELS}
                    empty="Nee"
                    onChange={(v) => setForm((f) => ({ ...f, grading_company: v, grade: v ? f.grade : '' }))}
                  />
                  {form.grading_company && (
                    <label>
                      Cijfer
                      <input inputMode="decimal" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="10" />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <datalist id="channel-options">
          {channels.map((c) => <option key={c} value={c} />)}
        </datalist>

        <Section title="Aankoop">
          <div className="row-3">
            <label>
              Prijs per stuk (€)
              <input inputMode="decimal" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="Leeg = uit eigen pack" />
            </label>
            <label>
              Kanaal
              <input list="channel-options" value={form.purchase_channel} onChange={(e) => set('purchase_channel', e.target.value)} maxLength={50} />
            </label>
            <label>
              Datum
              <input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
            </label>
          </div>
        </Section>

        {form.status !== 'collection' && (
          <Section title={form.status === 'sold' ? 'Verkoop' : 'Te koop'}>
            <div className="row-3">
              <label>
                {form.status === 'sold' ? 'Verkocht voor (per stuk, €)' : 'Vraagprijs (per stuk, €)'}
                <input inputMode="decimal" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} placeholder="0,00" />
              </label>
              <label>
                Kanaal
                <input list="channel-options" value={form.sale_channel} onChange={(e) => set('sale_channel', e.target.value)} maxLength={50} />
              </label>
              {form.status === 'sold' && (
                <label>
                  Datum
                  <input type="date" value={form.sale_date} onChange={(e) => set('sale_date', e.target.value)} />
                </label>
              )}
            </div>
          </Section>
        )}

        {isCard && (
          <LinkPicker
            name={form.name}
            language={form.language || null}
            setCode={form.set_code}
            cardNumber={form.card_number}
            value={form.tcgdex_id}
            onSelect={(c, lang) => void onPick(c, lang)}
            onClear={() => set('tcgdex_id', null)}
          />
        )}

        {isCard && form.tcgdex_id && (
          <Section title="Marktprijs">
            <PriceHistory tcgdexId={form.tcgdex_id} variant={form.variant || null} />
          </Section>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <footer className="dialog-foot">
          {card && (
            <button type="button" className={confirmDelete ? 'danger' : 'ghost danger-text'} onClick={onDelete} disabled={busy}>
              {confirmDelete ? 'Ja, verwijderen' : 'Verwijderen'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={() => ref.current?.close()} disabled={busy}>
            Annuleren
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Opslaan…' : 'Opslaan'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
