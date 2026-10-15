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
}

const pct = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 1 })

const countLabel = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Bedrag met expliciet teken, zodat winst/verlies niet alleen via kleur leesbaar is. */
function signedEur(n: number): string {
  if (n === 0) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

function Tile({ label, bucket, unit, href }: { label: string; bucket: Bucket; unit: string; href: string }): JSX.Element {
  return (
    <a className="stat" href={href}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{formatEur(bucket.amount)}</span>
      <span className="stat-sub">{unit}</span>
    </a>
  )
}

function MoverList({ title, items, empty }: { title: string; items: Mover<Card>[]; empty: string }): JSX.Element {
  return (
    <div className="panel">
      <h2 className="panel-title">{title}</h2>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ol className="mover-list">
          {items.map(({ card, market }) => (
            <li key={card.id} className="mover">
              <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} />
              <span className="mover-name" title={card.name}>
                {card.name}
                <span className="muted small"> #{card.card_number}</span>
              </span>
              <span className="mover-price">
                {formatEur(market.value)}
                <ChangeBadge change={market.change30} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function DashboardView({ cards, prices, pricesLoading, series }: Props): JSX.Element {
  const stats = useMemo(() => computeStats(cards), [cards])
  const market = useMemo(() => summarizeMarket(cards, prices), [cards, prices])
  const movers = useMemo(() => topMovers(cards, prices), [cards, prices])

  if (cards.length === 0) {
    return (
      <section className="page">
        <p className="empty">
          Nog geen kaarten. <a href="#/import">Importeer je Excel</a> of <a href="#/scan">scan je eerste kaart</a>.
        </p>
      </section>
    )
  }

  const listed = stats.sold.count + stats.forSale.count
  const askingDiff = market.forSale.value > 0 ? market.forSale.asking / market.forSale.value - 1 : null

  return (
    <section className="page dashboard">
      <div className="page-head">
        <div>
          <h1>Overzicht</h1>
          <p className="muted">Marktwaarde op basis van Cardmarket-trendprijzen.</p>
        </div>
      </div>

      <div className="hero">
        <span className="stat-label">Waarde van je collectie</span>
        <p className="hero-value">{pricesLoading ? '…' : formatEur(market.owned.value)}</p>
        {!pricesLoading && (
          <div className="hero-sub">
            {market.change30 !== null && <ChangeBadge change={market.change30} label="t.o.v. 30-daags gemiddelde" />}
            <span>
              {countLabel(market.owned.withPrice, 'kaart', 'kaarten')} met marktprijs
              {market.owned.withoutPrice > 0 && `, ${market.owned.withoutPrice} zonder`}
            </span>
            {market.paper.count > 0 && (
              <span>
                Betaald {formatEur(market.paper.cost)}, nu{' '}
                <strong className={market.paper.gain >= 0 ? 'up' : 'down'}>{signedEur(market.paper.gain)}</strong>
              </span>
            )}
          </div>
        )}
        {series && series.length >= 2 && <LineChart points={series} label="Waardeverloop" valueLabel="Waarde" />}
        {series && series.length < 2 && !pricesLoading && (
          <p className="muted small">Het waardeverloop verschijnt zodra er een paar dagen prijzen zijn opgeslagen.</p>
        )}
        {market.graded > 0 && (
          <p className="muted small">
            {countLabel(market.graded, 'gegradeerde kaart telt', 'gegradeerde kaarten tellen')} mee tegen de ongegradeerde
            prijs.
          </p>
        )}
      </div>

      {!pricesLoading && (
        <div className="movers">
          <MoverList title="Stijgers" items={movers.up} empty="Geen kaarten die duidelijk in prijs stijgen." />
          <MoverList title="Dalers" items={movers.down} empty="Geen kaarten die duidelijk in prijs dalen." />
          <MoverList title="Meest waardevol" items={movers.valuable} empty="Nog geen marktprijzen bekend." />
        </div>
      )}

      <h2 className="section-title">Verkoop en aankoop</h2>

      <div className="stat-row">
        <a className="stat stat-net" href="#/collectie">
          <span className="stat-label">Netto (verkocht min gekocht)</span>
          <span className={`stat-value ${stats.net >= 0 ? 'up' : 'down'}`}>{signedEur(stats.net)}</span>
          <span className="stat-sub">{stats.net >= 0 ? 'Winst' : 'Nog terug te verdienen'}</span>
        </a>
        <Tile label="Verkocht" bucket={stats.sold} unit={countLabel(stats.sold.count, 'kaart', 'kaarten')} href="#/collectie" />
        <Tile label="Te koop" bucket={stats.forSale} unit={countLabel(stats.forSale.count, 'kaart', 'kaarten')} href="#/collectie" />
        <Tile label="Gekocht" bucket={stats.bought} unit={countLabel(stats.bought.count, 'stuk', 'stuks')} href="#/collectie" />
      </div>

      <div className="split-panels">
        <div className="panel">
          <div className="meter-head">
            <span className="stat-label" id="ratio-label">
              Verkoopratio
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
            aria-valuetext={`${stats.sold.count} van ${listed} kaarten verkocht`}
          >
            <span className="meter-fill" style={{ width: `${stats.sellRatio * 100}%` }} />
          </span>
          <p className="muted small">
            {stats.sold.count} van {countLabel(listed, 'kaart', 'kaarten')} op je verkooplijst verkocht
          </p>
        </div>

        {askingDiff !== null && (
          <div className="panel">
            <span className="stat-label">Te koop: jouw prijs vs. markt</span>
            <span className="meter-value">
              {pct.format(Math.abs(askingDiff))} {askingDiff >= 0 ? 'boven' : 'onder'} markt
            </span>
            <p className="muted small">
              Vraagprijs {formatEur(market.forSale.asking)}, marktwaarde {formatEur(market.forSale.value)} (
              {countLabel(market.forSale.count, 'kaart', 'kaarten')})
            </p>
          </div>
        )}
      </div>

      <dl className="averages">
        <div>
          <dt>Gemiddelde verkoopprijs</dt>
          <dd>{formatEur(stats.avgSold)}</dd>
        </div>
        <div>
          <dt>Gemiddelde aankoopprijs</dt>
          <dd>{formatEur(stats.avgBought)}</dd>
        </div>
        <div>
          <dt>Gemiddelde waarde te koop</dt>
          <dd>{formatEur(stats.avgForSale)}</dd>
        </div>
      </dl>
    </section>
  )
}
