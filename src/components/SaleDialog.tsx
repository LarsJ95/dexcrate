import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import { parseMoney, moneyText, today } from '../lib/money'
import { saleResult, type CostCard } from '../lib/results'
import { formatEur } from '../lib/stats'
import { TX_STATUS_LABELS, type Transaction, type TxStatus } from '../lib/transactionTypes'
import { listTransactions, recordSale } from '../lib/transactions'
import type { Card } from '../lib/types'
import { Sheet } from './Sheet'

interface Props {
  /** Kaartregels die je verkoopt (alleen in bezit). */
  cards: Card[]
  onClose: () => void
  /** Na opslaan: collectie opnieuw laden (regels kunnen gesplitst zijn). */
  onSaved: () => void
}

type OpenStatus = Exclude<TxStatus, 'cancelled' | 'returned'>
const OPEN_STATUSES: OpenStatus[] = ['completed', 'shipped', 'paid', 'open']

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

/** Verkoop vastleggen: één kaart, meerdere kaarten of een lot voor één totaalbedrag. */
export function SaleDialog({ cards, onClose, onSaved }: Props): JSX.Element {
  const many = cards.length > 1 || cards.some((c) => c.quantity > 1)
  const [lot, setLot] = useState(cards.length > 1)
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(cards.map((c) => [c.id, String(c.quantity)])))
  // Vraagprijs als startwaarde per stuk (alleen als de kaart te koop stond).
  const [unit, setUnit] = useState<Record<string, string>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.availability === 'for_sale' ? moneyText(c.sale_price) : ''])),
  )
  const [total, setTotal] = useState('')
  const [date, setDate] = useState(today())
  const [channel, setChannel] = useState('')
  const [buyer, setBuyer] = useState('')
  const [shipIn, setShipIn] = useState('')
  const [fees, setFees] = useState('')
  const [shipCost, setShipCost] = useState('')
  const [status, setStatus] = useState<OpenStatus>('completed')
  const [notes, setNotes] = useState('')
  const [purchases, setPurchases] = useState<Transaction[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Aankopen voor de kostprijs in de voorvertoning; zonder lukt opslaan ook, alleen de voorvertoning is dan grover.
  useEffect(() => {
    let cancelled = false
    listTransactions()
      .then((list) => {
        if (!cancelled) setPurchases(list.filter((t) => t.kind === 'purchase'))
      })
      .catch((err: unknown) => console.warn('Aankopen laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])

  const costCards = useMemo(
    () => new Map<string, CostCard>(cards.map((c) => [c.id, { id: c.id, purchase_price: c.purchase_price, split_from: c.split_from }])),
    [cards],
  )

  // Formulier → transactie (voor voorvertoning en opslaan). Ongeldige invoer → foutmelding.
  // Goedkoop genoeg om elke render opnieuw te bepalen.
  function buildDraft(): { tx: Transaction } | { error: string } {
    const lines: Transaction['lines'] = []
    let sumCents = 0
    let allPriced = true
    for (const c of cards) {
      const q = Number(qty[c.id])
      if (!Number.isInteger(q) || q < 1 || q > c.quantity) return { error: `Quantity for "${c.name}" must be 1 to ${c.quantity}.` }
      let unitAmount: number | null = null
      if (!lot) {
        const u = parseMoney(unit[c.id] ?? '', `price for "${c.name}"`)
        if ('error' in u) return u
        unitAmount = u.value
        if (unitAmount === null) allPriced = false
        else sumCents += q * Math.round(unitAmount * 100)
      }
      lines.push({ id: c.id, card_id: c.id, quantity: q, unit_amount: unitAmount })
    }
    let amount: number | null
    if (lot) {
      const t = parseMoney(total, 'total')
      if ('error' in t) return t
      amount = t.value
    } else {
      amount = allPriced ? sumCents / 100 : null
    }
    const fields = { shipIn: parseMoney(shipIn, 'shipping received'), fees: parseMoney(fees, 'fees'), shipCost: parseMoney(shipCost, 'shipping cost') }
    for (const f of Object.values(fields)) if ('error' in f) return f
    const val = (r: { value: number | null } | { error: string }): number | null => ('value' in r ? r.value : null)
    return {
      tx: {
        id: 'draft',
        kind: 'sale',
        occurred_on: date || null,
        channel: channel.trim() || null,
        counterparty: buyer.trim() || null,
        amount,
        shipping_amount: val(fields.shipIn),
        fees_amount: val(fields.fees),
        shipping_cost: val(fields.shipCost),
        refund_amount: null,
        status,
        notes: notes.trim() || null,
        created_at: '',
        lines,
      },
    }
  }
  const draft = buildDraft()

  const preview = 'tx' in draft ? saleResult(draft.tx, costCards, purchases) : null

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    if ('error' in draft) {
      setError(draft.error)
      return
    }
    if (channel.trim().length > 50 || buyer.trim().length > 100 || notes.trim().length > 2000) {
      setError('Channel (50), buyer (100) or notes (2000 characters) is too long.')
      return
    }
    const tx = draft.tx
    setBusy(true)
    setError(null)
    try {
      await recordSale({
        occurred_on: tx.occurred_on,
        channel: tx.channel,
        counterparty: tx.counterparty,
        amount: tx.amount,
        shipping_amount: tx.shipping_amount,
        fees_amount: tx.fees_amount,
        shipping_cost: tx.shipping_cost,
        status,
        notes: tx.notes,
        lines: tx.lines.map((l) => ({ card_id: l.card_id ?? '', quantity: l.quantity, unit_amount: l.unit_amount })),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the sale failed.')
      setBusy(false)
    }
  }

  return (
    <Sheet title={cards.length === 1 ? `Sell ${cards[0].name}` : `Sell ${cards.length} cards`} onClose={onClose}>
      <form className="card-form" onSubmit={onSubmit} noValidate>
        {cards.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label="Price">
            <button type="button" role="radio" aria-checked={!lot} onClick={() => setLot(false)}>
              Price per card
            </button>
            <button type="button" role="radio" aria-checked={lot} onClick={() => setLot(true)}>
              One price for all (lot)
            </button>
          </div>
        )}

        <ul className="sale-lines">
          {cards.map((c) => (
            <li key={c.id}>
              <span className="sale-line-name">
                {c.name}
                <span className="muted small"> {[c.set_code, c.card_number && `#${c.card_number}`].filter(Boolean).join(' ')}</span>
              </span>
              {many && (
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={c.quantity}
                    value={qty[c.id]}
                    onChange={(e) => setQty((q) => ({ ...q, [c.id]: e.target.value }))}
                  />
                </label>
              )}
              {!lot && (
                <label>
                  Price each (€)
                  <input inputMode="decimal" value={unit[c.id]} placeholder="unknown" onChange={(e) => setUnit((u) => ({ ...u, [c.id]: e.target.value }))} />
                </label>
              )}
            </li>
          ))}
        </ul>
        {lot && (
          <p className="muted small">Only the lot price is recorded; no price is made up per card.</p>
        )}

        <div className="form-grid">
          {lot && (
            <label>
              Total for the cards (€)
              <input inputMode="decimal" value={total} placeholder="unknown" onChange={(e) => setTotal(e.target.value)} />
            </label>
          )}
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Channel
            <input value={channel} maxLength={50} placeholder="e.g. Cardmarket" onChange={(e) => setChannel(e.target.value)} />
          </label>
          <label>
            Buyer
            <input value={buyer} maxLength={100} onChange={(e) => setBuyer(e.target.value)} />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as OpenStatus)}>
              {OPEN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TX_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="form-group">
          <legend>Costs</legend>
          <p className="muted small">Leave empty if unknown. Enter 0 if there were none.</p>
          <div className="form-grid">
            <label>
              Shipping paid by buyer (€)
              <input inputMode="decimal" value={shipIn} placeholder="unknown" onChange={(e) => setShipIn(e.target.value)} />
            </label>
            <label>
              Platform and payment fees (€)
              <input inputMode="decimal" value={fees} placeholder="unknown" onChange={(e) => setFees(e.target.value)} />
            </label>
            <label>
              Your shipping and packaging (€)
              <input inputMode="decimal" value={shipCost} placeholder="unknown" onChange={(e) => setShipCost(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="ghost small-btn"
            onClick={() => {
              setShipIn('0')
              setFees('0')
              setShipCost('0')
            }}
          >
            No shipping or fees
          </button>
        </fieldset>

        <label>
          Notes
          <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {preview && (
          <dl className="result-preview">
            <div>
              <dt>Revenue</dt>
              <dd>{preview.revenue === null ? 'Unknown' : formatEur(preview.revenue)}</dd>
            </div>
            <div>
              <dt>Costs</dt>
              <dd>{preview.costs === null ? 'Unknown' : formatEur(preview.costs)}</dd>
            </div>
            <div>
              <dt>Purchase cost</dt>
              <dd>{preview.costBasis === null ? 'Unknown' : formatEur(preview.costBasis)}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd className={preview.result === null ? undefined : preview.result >= 0 ? 'up' : 'down'}>
                {preview.result === null ? 'Not final' : signedEur(preview.result)}
              </dd>
            </div>
          </dl>
        )}
        {preview && preview.missing.length > 0 && <p className="muted small">Missing for a final result: {preview.missing.join(', ')}.</p>}

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
            {busy ? 'Saving…' : 'Record sale'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
