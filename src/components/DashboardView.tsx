import { useMemo, type JSX } from 'react'
import { summarizeMarket, topMovers, type Mover, type PriceMap, type SeriesPoint } from '../lib/prices'
import { computeStats, formatEur, type Bucket } from '../lib/stats'
import type { Card } from '../lib/types'
import { CardImage } from './CardImage'
import { ChangeBadge } from './ChangeBadge'
import { LineChart } from './LineChart'

interface Props {
  cards: Card[]
  prices: PriceMap
  pricesLoading: boolean
  /** Waardeverloop uit dagelijkse opnames; null = (nog) niet beschikbaar. */
  series: SeriesPoint[] | null
  /** Kaart openen in de popup. */
  onOpenCard?: (id: string) => void
}

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 1 })

const countLabel = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Bedrag met expliciet teken, zodat winst/verlies niet alleen via kleur leesbaar is. */
function signedEur(n: number): string {
  if (n === 0) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

function Tile({ label, bucket, unit }: { label: string; bucket: Bucket; unit: string }): JSX.Element {
  return (
    <a className="stat" href="#/collection">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{formatEur(bucket.amount)}</span>
      <span className="stat-sub">{unit}</span>
    </a>
  )
}

function MoverList({
  title,
  items,
  empty,
  onOpenCard,
}: {
  title: string
  items: Mover<Card>[]
  empty: string
  onOpenCard?: (id: string) => void
}): JSX.Element {
  return (
    <div className="panel">
      <h2 className="panel-title">{title}</h2>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ol className="mover-list">
          {items.map(({ card, market }) => (
            <li key={card.id}>
              <button type="button" className="mover" onClick={() => onOpenCard?.(card.id)} aria-label={`Open ${card.name}`}>
                <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} />
                <span className="mover-name">
                  {card.name}
                  {card.card_number && <span className="muted"> #{card.card_number}</span>}
                </span>
                <span className="mover-price">
                  {formatEur(market.value)}
                  <ChangeBadge change={market.change30} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function DashboardView({ cards, prices, pricesLoading, series, onOpenCard }: Props): JSX.Element {
  const stats = useMemo(() => computeStats(cards), [cards])
  const market = useMemo(() => summarizeMarket(cards, prices), [cards, prices])
  const movers = useMemo(() => topMovers(cards, prices), [cards, prices])

  if (cards.length === 0) {
    return (
      <section className="page">
        <p className="empty">
          No cards yet. <a href="#/import">Import your Excel file</a> or <a href="#/scan">scan a card</a>.
        </p>
      </section>
    )
  }

  const listed = stats.sold.count + stats.forSale.count
  const askingDiff = market.forSale.value > 0 ? market.forSale.asking / market.forSale.value - 1 : null

  return (
    <section className="page dashboard">
      <h1>Overview</h1>

      <div className="hero">
        <span className="stat-label">Collection value</span>
        <p className="hero-value">{pricesLoading ? '…' : formatEur(market.owned.value)}</p>
        {!pricesLoading && (
          <div className="hero-sub">
            {market.change30 !== null && <ChangeBadge change={market.change30} label="vs 30-day average" />}
            <span>{countLabel(market.owned.withPrice + market.owned.withoutPrice, 'card', 'cards')}</span>
            {market.paper.count > 0 && (
              <span>
                Paid {formatEur(market.paper.cost)},{' '}
                <strong className={market.paper.gain >= 0 ? 'up' : 'down'}>{signedEur(market.paper.gain)}</strong>
              </span>
            )}
          </div>
        )}
        {series && series.length >= 2 && <LineChart points={series} label="Value history" valueLabel="Value" />}
      </div>

      {!pricesLoading && (
        <div className="movers">
          <MoverList title="Gainers" items={movers.up} empty="No clear risers." onOpenCard={onOpenCard} />
          <MoverList title="Losers" items={movers.down} empty="No clear fallers." onOpenCard={onOpenCard} />
          <MoverList title="Most valuable" items={movers.valuable} empty="No market prices yet." onOpenCard={onOpenCard} />
        </div>
      )}

      <h2 className="section-title">Sales</h2>

      <div className="stat-row">
        <a className="stat" href="#/collection">
          <span className="stat-label">Net (sold − bought)</span>
          <span className={`stat-value ${stats.net >= 0 ? 'up' : 'down'}`}>{signedEur(stats.net)}</span>
          <span className="stat-sub">{stats.net >= 0 ? 'Profit' : 'To recoup'}</span>
        </a>
        <Tile label="Sold" bucket={stats.sold} unit={countLabel(stats.sold.count, 'card', 'cards')} />
        <Tile label="For sale" bucket={stats.forSale} unit={countLabel(stats.forSale.count, 'card', 'cards')} />
        <Tile label="Bought" bucket={stats.bought} unit={countLabel(stats.bought.count, 'item', 'items')} />
      </div>

      <div className="split-panels">
        <div className="panel">
          <div className="meter-head">
            <span className="stat-label" id="ratio-label">
              Sell-through
            </span>
            <span className="meter-value">{pct.format(stats.sellRatio)}</span>
          </div>
          <span
            className="meter"
            role="meter"
            aria-labelledby="ratio-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(stats.sellRatio * 1000) / 10}
            aria-valuetext={`${stats.sold.count} of ${listed} cards sold`}
          >
            <span className="meter-fill" style={{ width: `${stats.sellRatio * 100}%` }} />
          </span>
          <p className="muted small">
            {stats.sold.count} of {countLabel(listed, 'card', 'cards')} sold
          </p>
        </div>

        {askingDiff !== null && (
          <div className="panel">
            <span className="stat-label">Asking vs market</span>
            <span className="meter-value">
              {pct.format(Math.abs(askingDiff))} {askingDiff >= 0 ? 'above' : 'below'}
            </span>
            <p className="muted small">
              Asking {formatEur(market.forSale.asking)}, market {formatEur(market.forSale.value)}
            </p>
          </div>
        )}
      </div>

      <dl className="averages">
        <div>
          <dt>Avg. sale price</dt>
          <dd>{formatEur(stats.avgSold)}</dd>
        </div>
        <div>
          <dt>Avg. purchase price</dt>
          <dd>{formatEur(stats.avgBought)}</dd>
        </div>
        <div>
          <dt>Avg. asking price</dt>
          <dd>{formatEur(stats.avgForSale)}</dd>
        </div>
      </dl>
    </section>
  )
}
