import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from 'react'
import { moneyText, parseMoney } from '../lib/money'
import { saleResult, type CostCard } from '../lib/results'
import { formatEur } from '../lib/stats'
import { TX_KIND_LABELS, TX_STATUS_LABELS, isVoid, type Transaction, type TxStatus } from '../lib/transactionTypes'
import {
  deleteDocument,
  documentUrl,
  listDocuments,
  setSaleStatus,
  updateTransaction,
  uploadDocument,
  type TxDocument,
} from '../lib/transactions'
import type { Card } from '../lib/types'
import { Sheet } from './Sheet'
import { errorText } from '../lib/errors'

interface Props {
  tx: Transaction
  cards: ReadonlyMap<string, Card>
  purchases: readonly Transaction[]
  onClose: () => void
  /** Transactie gewijzigd (bedragen) of status gewijzigd (kaarten kunnen terug in bezit zijn). */
  onChanged: (reloadCards: boolean) => void
}

/** Volgende stap in de verkoopafhandeling. */
const NEXT: Partial<Record<TxStatus, TxStatus>> = { open: 'paid', paid: 'shipped', shipped: 'completed' }

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

/** Eén transactie: kaarten, bedragen aanpassen, status, retour/annuleren en aankoopbewijzen. */
export function TransactionDialog({ tx, cards, purchases, onClose, onChanged }: Props): JSX.Element {
  const sale = tx.kind === 'sale'
  const [form, setForm] = useState({
    amount: moneyText(tx.amount),
    shipping_amount: moneyText(tx.shipping_amount),
    fees_amount: moneyText(tx.fees_amount),
    shipping_cost: moneyText(tx.shipping_cost),
    refund_amount: moneyText(tx.refund_amount),
    occurred_on: tx.occurred_on ?? '',
    channel: tx.channel ?? '',
    counterparty: tx.counterparty ?? '',
    notes: tx.notes ?? '',
  })
  const [docs, setDocs] = useState<TxDocument[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'cancelled' | 'returned' | null>(null)
  const [refund, setRefund] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    listDocuments(tx.id)
      .then((d) => {
        if (!cancelled) setDocs(d)
      })
      .catch((err: unknown) => {
        console.warn('Bewijzen laden mislukt', err)
        if (!cancelled) setDocs([])
      })
    return () => {
      cancelled = true
    }
  }, [tx.id])

  const set = (key: keyof typeof form, value: string): void => setForm((f) => ({ ...f, [key]: value }))

  const costCards = new Map<string, CostCard>([...cards.values()].map((c) => [c.id, { id: c.id, purchase_price: c.purchase_price, split_from: c.split_from }]))
  const result = sale ? saleResult(tx, costCards, purchases) : null

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorText(err, 'Saving failed.'))
    } finally {
      setBusy(false)
    }
  }

  function onSave(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const parsed = {
      amount: parseMoney(form.amount, 'amount'),
      shipping_amount: parseMoney(form.shipping_amount, sale ? 'shipping received' : 'shipping'),
      fees_amount: parseMoney(form.fees_amount, sale ? 'fees' : 'other costs'),
      shipping_cost: parseMoney(form.shipping_cost, 'shipping cost'),
      refund_amount: parseMoney(form.refund_amount, 'refund'),
    }
    for (const r of Object.values(parsed)) {
      if ('error' in r) {
        setError(r.error)
        return
      }
    }
    const v = (r: { value: number | null } | { error: string }): number | null => ('value' in r ? r.value : null)
    void run(async () => {
      await updateTransaction(tx.id, {
        amount: v(parsed.amount),
        shipping_amount: v(parsed.shipping_amount),
        fees_amount: v(parsed.fees_amount),
        shipping_cost: sale ? v(parsed.shipping_cost) : null,
        refund_amount: sale ? v(parsed.refund_amount) : null,
        occurred_on: form.occurred_on || null,
        channel: form.channel.trim().slice(0, 50) || null,
        counterparty: form.counterparty.trim().slice(0, 100) || null,
        notes: form.notes.trim().slice(0, 2000) || null,
      })
      onChanged(false)
    })
  }

  function changeStatus(status: TxStatus): void {
    let refundValue: number | null = null
    if (status === 'returned' && refund.trim()) {
      const r = parseMoney(refund, 'refund')
      if ('error' in r) {
        setError(r.error)
        return
      }
      refundValue = r.value
    }
    void run(async () => {
      await setSaleStatus(tx.id, status, refundValue)
      onChanged(isVoid(status))
    })
  }

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void run(async () => {
      const doc = await uploadDocument(tx.id, file)
      setDocs((d) => [...(d ?? []), doc])
    })
  }

  const openDoc = (doc: TxDocument): Promise<void> =>
    run(async () => {
      window.open(await documentUrl(doc.path), '_blank', 'noopener')
    })

  const removeDoc = (doc: TxDocument): Promise<void> =>
    run(async () => {
      await deleteDocument(doc)
      setDocs((d) => d?.filter((x) => x.id !== doc.id) ?? null)
    })

  const next = NEXT[tx.status]
  const final = isVoid(tx.status)

  return (
    <Sheet title={`${TX_KIND_LABELS[tx.kind]}${tx.occurred_on ? `, ${tx.occurred_on}` : ''}`} onClose={onClose}>
      <div className="chips">
        <span className={`chip${final ? '' : ' status-for_sale'}`}>{TX_STATUS_LABELS[tx.status]}</span>
      </div>

      <ul className="sale-lines">
        {tx.lines.map((l) => {
          const c = l.card_id ? cards.get(l.card_id) : undefined
          return (
            <li key={l.id}>
              <span className="sale-line-name">
                {l.quantity > 1 ? `${l.quantity}× ` : ''}
                {c?.name ?? 'Removed card'}
                {c && <span className="muted small"> {[c.set_code, c.card_number && `#${c.card_number}`].filter(Boolean).join(' ')}</span>}
              </span>
              <span>{l.unit_amount === null ? <span className="muted">part of total</span> : `${formatEur(l.unit_amount)} each`}</span>
            </li>
          )
        })}
      </ul>

      {result && !result.excluded && (
        <dl className="result-preview">
          <div>
            <dt>Revenue</dt>
            <dd>{result.revenue === null ? 'Unknown' : formatEur(result.revenue)}</dd>
          </div>
          <div>
            <dt>Costs</dt>
            <dd>{result.costs === null ? 'Unknown' : formatEur(result.costs)}</dd>
          </div>
          <div>
            <dt>Purchase cost</dt>
            <dd>{result.costBasis === null ? 'Unknown' : formatEur(result.costBasis)}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd className={result.result === null ? undefined : result.result >= 0 ? 'up' : 'down'}>
              {result.result === null ? 'Not final' : signedEur(result.result)}
            </dd>
          </div>
        </dl>
      )}
      {result && result.missing.length > 0 && <p className="muted small">Missing for a final result: {result.missing.join(', ')}.</p>}
      {final && <p className="muted small">This sale is {TX_STATUS_LABELS[tx.status].toLowerCase()}: it does not count in your results and its cards are back in your collection.</p>}

      {sale && !final && next && (
        <div className="sheet-foot">
          <button type="button" onClick={() => changeStatus(next)} disabled={busy}>
            Mark as {TX_STATUS_LABELS[next].toLowerCase()}
          </button>
        </div>
      )}

      <form className="card-form" onSubmit={onSave} noValidate>
        <fieldset className="form-group">
          <legend>Details</legend>
          <p className="muted small">Leave amounts empty if unknown. Enter 0 if there were none.</p>
          <div className="form-grid">
            <label>
              {sale ? 'Sale amount (€)' : 'Total for the cards (€)'}
              <input inputMode="decimal" value={form.amount} placeholder="unknown" onChange={(e) => set('amount', e.target.value)} />
            </label>
            <label>
              {sale ? 'Shipping paid by buyer (€)' : 'Shipping paid (€)'}
              <input inputMode="decimal" value={form.shipping_amount} placeholder="unknown" onChange={(e) => set('shipping_amount', e.target.value)} />
            </label>
            <label>
              {sale ? 'Platform and payment fees (€)' : 'Other costs (€)'}
              <input inputMode="decimal" value={form.fees_amount} placeholder="unknown" onChange={(e) => set('fees_amount', e.target.value)} />
            </label>
            {sale && (
              <>
                <label>
                  Your shipping and packaging (€)
                  <input inputMode="decimal" value={form.shipping_cost} placeholder="unknown" onChange={(e) => set('shipping_cost', e.target.value)} />
                </label>
                <label>
                  Refunded (€)
                  <input inputMode="decimal" value={form.refund_amount} placeholder="none" onChange={(e) => set('refund_amount', e.target.value)} />
                </label>
              </>
            )}
            <label>
              Date
              <input type="date" value={form.occurred_on} onChange={(e) => set('occurred_on', e.target.value)} />
            </label>
            <label>
              Channel
              <input value={form.channel} maxLength={50} onChange={(e) => set('channel', e.target.value)} />
            </label>
            <label>
              {sale ? 'Buyer' : 'Seller'}
              <input value={form.counterparty} maxLength={100} onChange={(e) => set('counterparty', e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="ghost small-btn"
            onClick={() => setForm((f) => ({ ...f, shipping_amount: '0', fees_amount: '0', shipping_cost: sale ? '0' : f.shipping_cost }))}
          >
            {sale ? 'No shipping or fees' : 'No extra costs'}
          </button>
          <label>
            Notes
            <textarea value={form.notes} maxLength={2000} rows={2} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </fieldset>

        <fieldset className="form-group">
          <legend>Receipts</legend>
          <p className="muted small">Private: only you can open these.</p>
          {docs === null ? (
            <p className="muted small">Loading…</p>
          ) : docs.length > 0 ? (
            <ul className="doc-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <button type="button" className="ghost small-btn" onClick={() => void openDoc(d)} disabled={busy}>
                    {d.name ?? 'Document'}
                  </button>
                  <button type="button" className="ghost small-btn danger-text" onClick={() => void removeDoc(d)} disabled={busy}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          <button type="button" className="small-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            Add receipt
          </button>
        </fieldset>

        {sale && !final && (
          <fieldset className="form-group">
            <legend>Cancel or return</legend>
            <p className="muted small">The cards go back to your collection (for sale). The sale stays in your history but no longer counts.</p>
            <div className="sheet-foot">
              {confirm ? (
                <>
                  {confirm === 'returned' && (
                    <label className="inline-field">
                      Refunded (€)
                      <input inputMode="decimal" value={refund} placeholder="optional" onChange={(e) => setRefund(e.target.value)} />
                    </label>
                  )}
                  <button type="button" className="danger" onClick={() => changeStatus(confirm)} disabled={busy}>
                    Confirm {confirm === 'returned' ? 'return' : 'cancel'}
                  </button>
                  <button type="button" className="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                    Keep sale
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ghost danger-text" onClick={() => setConfirm('cancelled')} disabled={busy}>
                    Cancel sale
                  </button>
                  <button type="button" className="ghost danger-text" onClick={() => setConfirm('returned')} disabled={busy}>
                    Returned
                  </button>
                </>
              )}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <footer className="sheet-foot">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}
