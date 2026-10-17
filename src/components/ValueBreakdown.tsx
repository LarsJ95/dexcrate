import { useEffect, useMemo, useState, type JSX } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { marketValueOf, type PriceMap, type SnapshotRow } from '../lib/prices'
import { realizedSummary, type CostCard } from '../lib/results'
import { formatEur } from '../lib/stats'
import type { Transaction } from '../lib/transactionTypes'
import { hasTransactions, listTransactions } from '../lib/transactions'
import type { Card } from '../lib/types'
import { EMPTY_SETTINGS, collectionBreakdown, growthSplit, type UserSettings } from '../lib/valuation'
import { hasValuations, latestByCard, listValuations, loadSettings, type Valuation } from '../lib/valuationDb'

interface Props {
  cards: Card[]
  prices: PriceMap
  pricesLoading: boolean
  /** Dagelijkse prijsopnames (STAP2); leeg = geen historie. */
  snapshots: SnapshotRow[] | null
}

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * Wat je bezit, in vier gescheiden bedragen (kosten, marktwaarde, eigen waardering, geschatte netto-opbrengst),
 * plus het gerealiseerde resultaat en de waardegroei uitgesplitst. Onbekend wordt geteld, niet als 0 opgeteld.
 */
export function ValueBreakdown({ cards, prices, pricesLoading, snapshots }: Props): JSX.Element {
  const valuationsOn = useDbFeature(hasValuations, 'valuations') === true
  const transactionsOn = useDbFeature(hasTransactions, 'transactions') === true
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [txs, setTxs] = useState<Transaction[] | null>(null)

  useEffect(() => {
    if (!valuationsOn) return
    let cancelled = false
    Promise.all([listValuations(), loadSettings()])
      .then(([v, s]) => {
        if (cancelled) return
        setValuations(v)
        setSettings(s)
      })
      .catch((err: unknown) => console.warn('Waarderingen laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [valuationsOn])

  useEffect(() => {
    if (!transactionsOn) return
    let cancelled = false
    listTransactions()
      .then((t) => {
        if (!cancelled) setTxs(t)
      })
      .catch((err: unknown) => console.warn('Transacties laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [transactionsOn])

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const latest = useMemo(() => latestByCard(valuations), [valuations])

  const breakdown = useMemo(
    () =>
      collectionBreakdown(
        cards,
        (id) => {
          const c = byId.get(id)
          return c ? (marketValueOf(c, prices)?.value ?? null) : null
        },
        (id) => latest.get(id)?.amount ?? null,
        settings,
      ),
    [cards, byId, prices, latest, settings],
  )

  const realized = useMemo(() => {
    if (!txs) return null
    const costCards = new Map<string, CostCard>(cards.map((c) => [c.id, { id: c.id, purchase_price: c.purchase_price, split_from: c.split_from }]))
    return realizedSummary(txs, costCards)
  }, [txs, cards])

  const growth = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null
    const holdings = cards
      .filter((c) => c.ownership === 'owned' && c.kind === 'card' && c.tcgdex_id)
      .map((c) => ({
        tcgdexId: c.tcgdex_id as string,
        quantity: c.quantity,
        reverse: c.variant === 'reverse',
        acquiredOn: c.purchase_date ?? c.created_at.slice(0, 10),
      }))
    return growthSplit(holdings, snapshots)
  }, [cards, snapshots])

  const b = breakdown
  return (
    <>
      <h2 className="section-title">What you own</h2>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Purchase cost</span>
          <span className="stat-value">{formatEur(b.cost.amount)}</span>
          <span className="stat-sub">{b.cost.unknown > 0 ? `${plural(b.cost.unknown, 'copy', 'copies')} with unknown cost, not included` : `All ${b.copies} copies`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Market value (Cardmarket, indicative)</span>
          <span className="stat-value">{pricesLoading ? '…' : formatEur(b.market.amount)}</span>
          <span className="stat-sub">{b.market.unknown > 0 ? `${plural(b.market.unknown, 'copy', 'copies')} without price, not included` : `All ${b.copies} copies`}</span>
        </div>
        {valuationsOn && (
          <div className="stat">
            <span className="stat-label">Your valuations</span>
            <span className="stat-value">{b.yours.copies > 0 ? formatEur(b.yours.amount) : '–'}</span>
            <span className="stat-sub">{b.yours.copies > 0 ? `For ${plural(b.yours.copies, 'copy', 'copies')} you valued` : 'Add one in a card’s details'}</span>
          </div>
        )}
        {valuationsOn && (
          <div className="stat">
            <span className="stat-label">Estimated if sold</span>
            <span className="stat-value">{b.net ? formatEur(b.net.amount) : '–'}</span>
            <span className="stat-sub">{b.net ? `Market value minus your selling costs, ${plural(b.net.copies, 'copy', 'copies')}` : 'Set your selling costs in Settings'}</span>
          </div>
        )}
        {realized && (
          <a className="stat" href="#/transactions">
            <span className="stat-label">Realized result</span>
            <span className={`stat-value ${realized.result >= 0 ? 'up' : 'down'}`}>{signedEur(realized.result)}</span>
            <span className="stat-sub">
              {plural(realized.complete, 'complete sale', 'complete sales')}
              {realized.incomplete > 0 ? `; ${realized.incomplete} with unknown costs not included` : ''}
            </span>
          </a>
        )}
      </div>
      {b.incoming > 0 && <p className="muted small">{plural(b.incoming, 'copy is', 'copies are')} incoming and not included above.</p>}
      {growth && (
        <p className="muted small">
          Value change {growth.from} to {growth.to}: price movement {signedEur(growth.priceEffect)}, new cards {formatEur(growth.newPurchases)}
          {growth.unpriced > 0 ? ` (${plural(growth.unpriced, 'copy', 'copies')} without price history not included)` : ''}.
        </p>
      )}
    </>
  )
}
