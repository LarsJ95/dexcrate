import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { deleteItem, insertItem, updateItem, type Input, type Row, type Table } from '../lib/db'
import { normalizeChannel, parsePrice } from '../lib/excel'
import type { Candidate } from '../lib/match'
import { getSet, type Lang } from '../lib/tcgdex'
import type { ItemKind } from '../lib/types'
import { CardImage } from './CardImage'
import { LinkPicker } from './LinkPicker'

interface Props<T extends Table> {
  table: T
  item: Row<T> | null
  channels: readonly string[]
  nextSortOrder: number
  onClose: () => void
  onSaved: (row: Row<T>) => void
  onDeleted: (id: string) => void
}

interface FormState {
  name: string
  set_code: string
  card_number: string
  quantity: string
  unit_price: string
  channel: string
  kind: ItemKind
  sold: boolean
  tcgdex_id: string | null
}

const MAX_QTY = 9999
const MAX_PRICE = 1_000_000

function initialState(item: Row<Table> | null): FormState {
  return {
    name: item?.name ?? '',
    set_code: item?.set_code ?? '',
    card_number: item?.card_number ?? '',
    quantity: String(item?.quantity ?? 1),
    unit_price: item ? item.unit_price.toFixed(2).replace('.', ',') : '',
    channel: item?.channel ?? '',
    kind: item?.kind ?? 'card',
    sold: item && 'sold' in item ? item.sold : false,
    tcgdex_id: item?.tcgdex_id ?? null,
  }
}

/** Valideert het formulier; geeft een foutmelding of de op te slaan velden. */
function validate(f: FormState): { error: string } | { value: Omit<Input<'sales'>, 'sort_order'> } {
  const name = f.name.trim()
  if (!name) return { error: 'Vul een naam in.' }
  if (name.length > 200) return { error: 'Naam is te lang (max. 200 tekens).' }
  const qty = Number(f.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `Aantal moet een heel getal zijn van 1 tot ${MAX_QTY}.` }
  const price = parsePrice(f.unit_price)
  if (price === null || price > MAX_PRICE) return { error: 'Vul een geldige stukprijs in, bijvoorbeeld 4,95.' }
  const setCode = f.set_code.trim()
  const number = f.card_number.trim()
  const channel = normalizeChannel(f.channel)
  if (setCode.length > 20 || number.length > 20) return { error: 'Set en nummer mogen maximaal 20 tekens zijn.' }
  if (channel && channel.length > 50) return { error: 'Kanaal is te lang (max. 50 tekens).' }
  const sealed = f.kind === 'sealed'
  return {
    value: {
      name,
      set_code: sealed || !setCode ? null : setCode,
      card_number: sealed || !number ? null : number,
      quantity: qty,
      unit_price: price,
      channel,
      kind: f.kind,
      tcgdex_id: sealed ? null : f.tcgdex_id,
      sold: f.sold,
    },
  }
}

export function ItemDialog<T extends Table>({
  table,
  item,
  channels,
  nextSortOrder,
  onClose,
  onSaved,
  onDeleted,
}: Props<T>): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormState>(() => initialState(item))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isSales = table === 'sales'

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))

  async function onPick(c: Candidate, lang: Lang): Promise<void> {
    set('tcgdex_id', c.key)
    // Set en nummer gelijktrekken met de gekozen kaart (bv. "F" → "ASR").
    const number = /^\d+$/.test(c.localId) ? String(Number.parseInt(c.localId, 10)) : c.localId
    try {
      const setInfo = await getSet(lang, c.setId)
      setForm((f) => ({ ...f, set_code: setInfo?.summary.abbr ?? c.setId, card_number: number }))
    } catch (err) {
      console.error('Setinfo ophalen mislukt', err)
      setForm((f) => ({ ...f, set_code: c.setId, card_number: number }))
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
    const { sold, ...common } = result.value
    const payload = (isSales ? { ...common, sold } : common) as Partial<Input<T>>
    setBusy(true)
    setError(null)
    try {
      const row = item
        ? await updateItem(table, item.id, payload)
        : await insertItem(table, { ...payload, sort_order: nextSortOrder } as Input<T>)
      onSaved(row)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setBusy(false)
    }
  }

  async function onDelete(): Promise<void> {
    if (!item || busy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await deleteItem(table, item.id)
      onDeleted(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="item-dialog" onClose={onClose} aria-labelledby="item-dialog-title">
      <form onSubmit={onSubmit} noValidate>
        <header className="dialog-head">
          <h2 id="item-dialog-title">{item ? 'Regel bewerken' : isSales ? 'Kaart te koop zetten' : 'Aankoop toevoegen'}</h2>
          <button type="button" className="ghost icon" onClick={() => ref.current?.close()} aria-label="Sluiten">
            ✕
          </button>
        </header>

        <div className="dialog-body">
          <div className="dialog-preview">
            <CardImage tcgdexId={form.kind === 'card' ? form.tcgdex_id : null} kind={form.kind} name={form.name || 'Nieuwe kaart'} quality="high" />
          </div>

          <div className="fields">
            <fieldset className="kind-switch">
              <legend>Soort</legend>
              <label>
                <input type="radio" name="kind" checked={form.kind === 'card'} onChange={() => set('kind', 'card')} /> Losse kaart
              </label>
              <label>
                <input type="radio" name="kind" checked={form.kind === 'sealed'} onChange={() => set('kind', 'sealed')} /> Sealed product
              </label>
            </fieldset>

            <label>
              Naam
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required />
            </label>

            {form.kind === 'card' && (
              <div className="row-2">
                <label>
                  Set
                  <input value={form.set_code} onChange={(e) => set('set_code', e.target.value)} maxLength={20} placeholder="bv. MEW" />
                </label>
                <label>
                  Nummer
                  <input value={form.card_number} onChange={(e) => set('card_number', e.target.value)} maxLength={20} inputMode="numeric" />
                </label>
              </div>
            )}

            <div className="row-2">
              <label>
                Aantal
                <input type="number" min={1} max={MAX_QTY} step={1} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </label>
              <label>
                Stukprijs (€)
                <input inputMode="decimal" value={form.unit_price} onChange={(e) => set('unit_price', e.target.value)} placeholder="0,00" />
              </label>
            </div>

            <label>
              Kanaal
              <input list="channel-options" value={form.channel} onChange={(e) => set('channel', e.target.value)} maxLength={50} />
              <datalist id="channel-options">
                {channels.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>

            {isSales && (
              <label className="check">
                <input type="checkbox" checked={form.sold} onChange={(e) => set('sold', e.target.checked)} /> Verkocht
              </label>
            )}
          </div>
        </div>

        {form.kind === 'card' && (
          <LinkPicker
            name={form.name}
            setCode={form.set_code}
            cardNumber={form.card_number}
            value={form.tcgdex_id}
            onSelect={(c, lang) => void onPick(c, lang)}
            onClear={() => set('tcgdex_id', null)}
          />
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <footer className="dialog-foot">
          {item && (
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
