import { useMemo, useState, type FormEvent, type JSX } from 'react'
import { moneyText, parseMoney, today } from '../lib/money'
import { splitEvenly } from '../lib/results'
import { formatEur } from '../lib/stats'
import { recordPurchase } from '../lib/transactions'
import type { Card } from '../lib/types'
import { Sheet } from './Sheet'
import { errorText } from '../lib/errors'

interface Props {
  /** Kaartregels die bij deze aankoop horen (hele regels). */
  cards: Card[]
  onClose: () => void
  onSaved: () => void
}

/** Aankoop vastleggen voor bestaande kaartregels: totaal, verzending, overige kosten en (optioneel) verdeling per kaart. */
export function PurchaseDialog({ cards, onClose, onSaved }: Props): JSX.Element {
  const [total, setTotal] = useState('')
  const [unit, setUnit] = useState<Record<string, string>>(() => Object.fromEntries(cards.map((c) => [c.id, moneyText(c.purchase_price)])))
  const [shipping, setShipping] = useState('')
  const [fees, setFees] = useState('')
  const [date, setDate] = useState(today())
  const [channel, setChannel] = useState('')
  const [seller, setSeller] = useState('')
  const [notes, setNotes] = useState('')
  const hasIncoming = cards.some((c) => c.ownership === 'incoming')
  const [received, setReceived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const units = cards.reduce((n, c) => n + c.quantity, 0)

  // Controle: som van de bedragen per kaart tegenover het totaal.
  const allocation = useMemo(() => {
    let cents = 0
    let unknown = 0
    for (const c of cards) {
      const u = parseMoney(unit[c.id] ?? '', 'price')
      if ('error' in u || u.value === null) unknown += c.quantity
      else cents += c.quantity * Math.round(u.value * 100)
    }
    const t = parseMoney(total, 'total')
    return { allocated: cents / 100, unknown, total: 'value' in t ? t.value : null }
  }, [cards, unit, total])

  function spread(): void {
    const t = parseMoney(total, 'total')
    if ('error' in t || t.value === null) {
      setError('Enter the total first.')
      return
    }
    const parts = splitEvenly(t.value, cards.map((c) => c.quantity))
    setUnit(Object.fromEntries(cards.map((c, i) => [c.id, moneyText(parts[i])])))
    setError(null)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const amount = parseMoney(total, 'total')
    const ship = parseMoney(shipping, 'shipping')
    const other = parseMoney(fees, 'other costs')
    for (const r of [amount, ship, other]) {
      if ('error' in r) {
        setError(r.error)
        return
      }
    }
    const lines: { card_id: string; unit_amount: number | null }[] = []
    for (const c of cards) {
      const u = parseMoney(unit[c.id] ?? '', `price for "${c.name}"`)
      if ('error' in u) {
        setError(u.error)
        return
      }
      lines.push({ card_id: c.id, unit_amount: u.value })
    }
    if (channel.trim().length > 50 || seller.trim().length > 100 || notes.trim().length > 2000) {
      setError('Channel (50), seller (100) or notes (2000 characters) is too long.')
      return
    }
    const value = (r: { value: number | null } | { error: string }): number | null => ('value' in r ? r.value : null)
    setBusy(true)
    setError(null)
    try {
      await recordPurchase({
        occurred_on: date || null,
        channel: channel.trim() || null,
        counterparty: seller.trim() || null,
        amount: value(amount),
        shipping_amount: value(ship),
        fees_amount: value(other),
        notes: notes.trim() || null,
        received,
        lines,
      })
      onSaved()
    } catch (err) {
      setError(errorText(err, 'Saving the purchase failed.'))
      setBusy(false)
    }
  }

  const difference = allocation.total !== null && allocation.unknown === 0 ? Math.round((allocation.total - allocation.allocated) * 100) / 100 : null

  return (
    <Sheet title={cards.length === 1 ? `Purchase of ${cards[0].name}` : `Purchase of ${units} cards`} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label>
            Total for the cards (€)
            <input inputMode="decimal" value={total} placeholder="unknown" onChange={(e) => setTotal(e.target.value)} />
          </label>
          <label>
            Shipping paid (€)
            <input inputMode="decimal" value={shipping} placeholder="unknown" onChange={(e) => setShipping(e.target.value)} />
          </label>
          <label>
            Other costs (€)
            <input inputMode="decimal" value={fees} placeholder="unknown" onChange={(e) => setFees(e.target.value)} />
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Channel
            <input value={channel} maxLength={50} placeholder="e.g. Cardmarket" onChange={(e) => setChannel(e.target.value)} />
          </label>
          <label>
            Seller
            <input value={seller} maxLength={100} onChange={(e) => setSeller(e.target.value)} />
          </label>
        </div>
        <p className="muted small">Leave amounts empty if unknown. Enter 0 if there were none.</p>

        <fieldset className="form-group">
          <legend>Price per card</legend>
          <ul className="sale-lines">
            {cards.map((c) => (
              <li key={c.id}>
                <span className="sale-line-name">
                  {c.quantity > 1 ? `${c.quantity}× ` : ''}
                  {c.name}
                  <span className="muted small"> {[c.set_code, c.card_number && `#${c.card_number}`].filter(Boolean).join(' ')}</span>
                </span>
                <label>
                  Each (€)
                  <input inputMode="decimal" value={unit[c.id]} placeholder="unknown" onChange={(e) => setUnit((u) => ({ ...u, [c.id]: e.target.value }))} />
                </label>
              </li>
            ))}
          </ul>
          {cards.length > 1 || units > 1 ? (
            <button type="button" className="ghost small-btn" onClick={spread}>
              Split total evenly
            </button>
          ) : null}
          <p className="muted small" role="status">
            {allocation.unknown > 0
              ? `${allocation.unknown} ${allocation.unknown === 1 ? 'card has' : 'cards have'} no price yet: their purchase cost stays unknown.`
              : `Allocated ${formatEur(allocation.allocated)}${allocation.total !== null ? ` of ${formatEur(allocation.total)}` : ''}${
                  difference ? `, difference ${formatEur(difference)}` : ''
                }.`}
          </p>
        </fieldset>

        {hasIncoming && (
          <label className="check">
            <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} />
            Mark the incoming cards as received
          </label>
        )}

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
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record purchase'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
