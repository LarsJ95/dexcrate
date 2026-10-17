import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { TransactionDialog } from '../components/TransactionDialog'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { listCards } from '../lib/db'
import { realizedSummary, saleResult, type CostCard } from '../lib/results'
import { formatEur } from '../lib/stats'
import { TX_KIND_LABELS, TX_STATUS_LABELS, isVoid, type Transaction } from '../lib/transactionTypes'
import { listTransactions } from '../lib/transactions'
import type { Card } from '../lib/types'
import { Loading } from '../components/Loading'
import { errorText } from '../lib/errors'

type KindFilter = 'all' | 'sale' | 'purchase'
const FILTERS: [KindFilter, string][] = [
  ['all', 'All'],
  ['sale', 'Sales'],
  ['purchase', 'Purchases'],
]

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

/** Kort overzicht van de kaarten in een transactie: "Mew ex, Arbok +3". */
function summary(tx: Transaction, cards: ReadonlyMap<string, Card>): string {
  const names = tx.lines.map((l) => (l.card_id ? cards.get(l.card_id)?.name : undefined) ?? 'Removed card')
  const units = tx.lines.reduce((n, l) => n + l.quantity, 0)
  const head = names.slice(0, 2).join(', ')
  const rest = units - Math.min(2, names.length)
  return rest > 0 ? `${head} +${rest}` : head
}

/** Aankopen en verkopen: resultaat per verkoop, gerealiseerd totaal, status en bewijzen. */
export function TransactionsPage(): JSX.Element {
  const enabled = useTransactionsEnabled()
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<KindFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    Promise.all([listTransactions(), listCards()])
      .then(([t, c]) => {
        if (cancelled) return
        setTxs(t)
        setCards(c)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading transactions failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [enabled, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const costCards = useMemo(
    () => new Map<string, CostCard>(cards.map((c) => [c.id, { id: c.id, purchase_price: c.purchase_price, split_from: c.split_from }])),
    [cards],
  )
  const purchases = useMemo(() => (txs ?? []).filter((t) => t.kind === 'purchase'), [txs])
  const realized = useMemo(() => realizedSummary(txs ?? [], costCards), [txs, costCards])
  const visible = useMemo(() => (txs ?? []).filter((t) => filter === 'all' || t.kind === filter), [txs, filter])
  const current = open ? (txs ?? []).find((t) => t.id === open) : undefined

  if (enabled === false) {
    return (
      <section className="page">
        <h1>Transactions</h1>
        <p className="notice">Purchases and sales are not set up yet (run STAP5 in Supabase).</p>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="muted">Record a sale or purchase by selecting cards in your collection.</p>
        </div>
        <a className="button-link" href="#/collection">
          Select cards
        </a>
      </div>

      {txs && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">Realized result</span>
            <span className={`stat-value ${realized.result >= 0 ? 'up' : 'down'}`}>{signedEur(realized.result)}</span>
            <span className="stat-sub">
              From {realized.complete} complete {realized.complete === 1 ? 'sale' : 'sales'}
              {realized.incomplete > 0 ? `; ${realized.incomplete} not included (costs unknown)` : ''}
            </span>
          </div>
          {realized.pending > 0 && (
            <div className="stat">
              <span className="stat-label">In progress</span>
              <span className="stat-value">{realized.pending}</span>
              <span className="stat-sub">Not yet completed</span>
            </div>
          )}
        </div>
      )}

      <div className="segmented" role="group" aria-label="Type">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {txs === null && !error && <Loading />}
      {txs?.length === 0 && <p className="empty">No purchases or sales yet.</p>}

      {visible.length > 0 && (
        <ul className="tx-list">
          {visible.map((t) => {
            const r = t.kind === 'sale' ? saleResult(t, costCards, purchases) : null
            return (
              <li key={t.id}>
                <button type="button" className={`tx-row${isVoid(t.status) ? ' void' : ''}`} onClick={() => setOpen(t.id)}>
                  <span className="tx-main">
                    <span className="tx-title">
                      {TX_KIND_LABELS[t.kind]}
                      {t.status !== 'completed' && <span className="chip">{TX_STATUS_LABELS[t.status]}</span>}
                    </span>
                    <span className="muted small">
                      {[t.occurred_on, t.channel, t.counterparty].filter(Boolean).join(', ') || 'No date'}
                    </span>
                    <span className="tx-cards">{summary(t, cardMap)}</span>
                  </span>
                  <span className="tx-amounts">
                    <span className="tx-amount">{t.amount === null ? 'Unknown' : formatEur(t.amount)}</span>
                    {r && !r.excluded && (
                      <span className={r.result === null ? 'muted small' : r.result >= 0 ? 'up small' : 'down small'}>
                        {r.result === null ? 'Result not final' : signedEur(r.result)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {current && (
        <TransactionDialog
          key={current.id}
          tx={current}
          cards={cardMap}
          purchases={purchases}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null)
            reload()
          }}
        />
      )}
    </section>
  )
}
