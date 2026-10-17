import { errorText } from '../lib/errors'
import { useState, type FormEvent, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import type { Candidate } from '../lib/match'
import { showMoment } from '../lib/moments'
import { moneyText, parseMoney } from '../lib/money'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getSet, lookupLang, type Lang } from '../lib/tcgdex'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type CardLanguage, type Condition, type Variant } from '../lib/types'
import { addWishlistItem, deleteWishlistItem, updateWishlistItem, type WishlistInput, type WishlistItem } from '../lib/wishlist'
import { CardmarketLink } from './CardmarketLink'
import { LinkPicker } from './LinkPicker'
import { Sheet } from './Sheet'

interface Props {
  /** Bestaand item, of null voor een nieuw. */
  item: WishlistItem | null
  /** Startwaarden voor een nieuw item (bv. vanuit een set). */
  initial?: Partial<WishlistInput>
  onClose: () => void
  onSaved: (item: WishlistItem) => void
  onDeleted?: (id: string) => void
}

const PRIORITY_LABELS: Record<'1' | '2' | '3', string> = { '1': 'High', '2': 'Normal', '3': 'Low' }

/** Marktprijs en Cardmarket-link van de gekoppelde kaart (zonder koppeling: zoeken op naam en nummer). */
function WishMarket({ tcgdexId, variant, searchText }: { tcgdexId: string | null; variant: Variant | null; searchText: string }): JSX.Element | null {
  const price = useCardPrice(tcgdexId)
  if (!tcgdexId && !searchText.trim()) return null
  const market = marketValue(price, variant)
  return (
    <p className="wish-market">
      {tcgdexId && <span className="muted small">{price === undefined ? 'Market …' : market ? `Market ${formatEur(market.value)}` : 'No market price'}</span>}
      <CardmarketLink idProduct={price?.idProduct ?? null} searchText={searchText} />
    </p>
  )
}

/** Wishlist-item toevoegen of aanpassen; optioneel gekoppeld aan een cataloguskaart. */
export function WishlistDialog({ item, initial, onClose, onSaved, onDeleted }: Props): JSX.Element {
  const src = item ?? initial
  const [name, setName] = useState(src?.name ?? '')
  const [setCode, setSetCode] = useState(src?.set_code ?? '')
  const [number, setNumber] = useState(src?.card_number ?? '')
  const [tcgdexId, setTcgdexId] = useState<string | null>(src?.tcgdex_id ?? null)
  const [variant, setVariant] = useState<Variant | ''>(src?.variant ?? '')
  const [language, setLanguage] = useState<CardLanguage | ''>(src?.language ?? '')
  const [condition, setCondition] = useState<Condition | ''>(src?.min_condition ?? '')
  const [qty, setQty] = useState(String(src?.wanted_qty ?? 1))
  const [maxPrice, setMaxPrice] = useState(moneyText(src?.max_price ?? null))
  const [priority, setPriority] = useState<'1' | '2' | '3'>(String(src?.priority ?? 2) as '1' | '2' | '3')
  const [notes, setNotes] = useState(src?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Alleen uitvoeringen die volgens de catalogus bestaan.
  const info = useCardInfo(tcgdexId)
  const variantKeys = (Object.keys(VARIANT_LABELS) as Variant[]).filter((v) => !info?.variants || info.variants.includes(v) || v === variant)

  async function onPick(c: Candidate, lang: Lang): Promise<void> {
    setTcgdexId(c.key)
    setNumber(/^\d+$/.test(c.localId) ? String(Number.parseInt(c.localId, 10)) : c.localId)
    if (!name.trim()) setName(c.name)
    if (lookupLang(language || null) !== lang) setLanguage(lang)
    try {
      setSetCode((await getSet(lang, c.setId))?.summary.abbr ?? c.setId)
    } catch (err) {
      console.error('Setinfo ophalen mislukt', err)
      setSetCode(c.setId)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const n = name.trim()
    if (!n || n.length > 200) {
      setError('Enter a name (max. 200 characters).')
      return
    }
    const q = Number(qty)
    if (!Number.isInteger(q) || q < 1 || q > 99) {
      setError('Copies wanted must be 1 to 99.')
      return
    }
    const price = parseMoney(maxPrice, 'maximum price')
    if ('error' in price) {
      setError(price.error)
      return
    }
    if (setCode.trim().length > 20 || number.trim().length > 20 || notes.trim().length > 2000) {
      setError('Set and number can be at most 20 characters, notes 2000.')
      return
    }
    const input: WishlistInput = {
      tcgdex_id: tcgdexId,
      name: n,
      set_code: setCode.trim() || null,
      card_number: number.trim() || null,
      variant: variant || null,
      language: language || null,
      min_condition: condition || null,
      wanted_qty: q,
      max_price: price.value,
      priority: Number(priority) as 1 | 2 | 3,
      notes: notes.trim() || null,
    }
    setBusy(true)
    setError(null)
    try {
      if (item) {
        onSaved(await updateWishlistItem(item.id, input))
      } else {
        const added = await addWishlistItem(input)
        onSaved(added)
        showMoment({ kind: 'gotcha', name: added.name })
      }
    } catch (err) {
      setError(errorText(err, 'Saving failed.'))
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
      await deleteWishlistItem(item.id)
      onDeleted?.(item.id)
    } catch (err) {
      setError(errorText(err, 'Removing failed.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title={item ? `Edit wish: ${item.name}` : 'Add to wishlist'} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        <label>
          Name
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="form-grid">
          <label>
            Set
            <input value={setCode} maxLength={20} onChange={(e) => setSetCode(e.target.value)} />
          </label>
          <label>
            Number
            <input value={number} maxLength={20} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label>
            Variant
            <select value={variant} onChange={(e) => setVariant(e.target.value as Variant | '')}>
              <option value="">Any</option>
              {variantKeys.map((v) => (
                <option key={v} value={v}>
                  {VARIANT_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage | '')}>
              <option value="">Any</option>
              {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minimum condition
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Any</option>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Copies wanted
            <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label>
            Max. price (€)
            <input inputMode="decimal" value={maxPrice} placeholder="none" onChange={(e) => setMaxPrice(e.target.value)} />
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as '1' | '2' | '3')}>
              {(Object.keys(PRIORITY_LABELS) as ('1' | '2' | '3')[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="form-group">
          <legend>Linked card</legend>
          <LinkPicker
            name={name}
            language={language || null}
            setCode={setCode}
            cardNumber={number}
            value={tcgdexId}
            onSelect={(c, lang) => void onPick(c, lang)}
            onClear={() => setTcgdexId(null)}
          />
          <WishMarket tcgdexId={tcgdexId} variant={variant || null} searchText={[name, number].filter(Boolean).join(' ')} />
        </fieldset>

        <label>
          Notes
          <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <footer className="sheet-foot">
          {item && (
            <button type="button" className={confirmDelete ? 'danger' : 'ghost danger-text'} onClick={() => void onDelete()} disabled={busy}>
              {confirmDelete ? 'Confirm remove' : 'Remove'}
            </button>
          )}
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
