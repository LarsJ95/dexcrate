import { useEffect, useMemo, useState, type JSX } from 'react'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards } from '../lib/db'
import { summarizeMarket, type MarketSummary } from '../lib/prices'
import { computeStats, formatEur, type Bucket } from '../lib/stats'
import type { Card } from '../lib/types'

const pct = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 1 })

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function Tile({ label, bucket, unit, href }: { label: string; bucket: Bucket; unit: string; href?: string }): JSX.Element {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{formatEur(bucket.amount)}</span>
      <span className="stat-sub">{unit}</span>
    </>
  )
  return href ? (
    <a className="stat" href={href}>
      {body}
    </a>
  ) : (
    <div className="stat">{body}</div>
  )
}

/** Bedrag met expliciet teken, zodat winst/verlies niet alleen via kleur leesbaar is. */
function signedEur(n: number): string {
  if (n === 0) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

function MarketPanel({ market, loading }: { market: MarketSummary; loading: boolean }): JSX.Element {
  if (loading) {
    return (
      <div className="panel" aria-live="polite">
        <span className="stat-label">Marktwaarde</span>
        <p className="muted">Actuele Cardmarket-prijzen laden…</p>
      </div>
    )
  }
  const { owned, paper, forSale } = market
  const askingDiff = forSale.value > 0 ? forSale.asking / forSale.value - 1 : 0
  return (
    <div className="panel market">
      <div className="market-main">
        <span className="stat-label">Marktwaarde van wat je hebt</span>
        <span className="stat-value">{formatEur(owned.value)}</span>
        <span className="stat-sub">
          {countLabel(owned.withPrice, 'kaart', 'kaarten')} met Cardmarket-prijs
          {owned.withoutPrice > 0 && `, ${owned.withoutPrice} zonder (niet gekoppeld of geen data)`}
        </span>
      </div>
      <dl className="market-facts">
        {paper.count > 0 && (
          <div>
            <dt>Gekocht vs. nu waard</dt>
            <dd>
              <strong className={paper.gain >= 0 ? 'up' : 'down'}>{signedEur(paper.gain)}</strong>
              <span className="muted small">
                {' '}
                betaald {formatEur(paper.cost)}, nu {formatEur(paper.value)} ({countLabel(paper.count, 'kaart', 'kaarten')})
              </span>
            </dd>
          </div>
        )}
        {forSale.count > 0 && (
          <div>
            <dt>Te koop: jouw prijs vs. markt</dt>
            <dd>
              <strong>{pct.format(Math.abs(askingDiff))} {askingDiff >= 0 ? 'boven' : 'onder'} markt</strong>
              <span className="muted small">
                {' '}
                vraagprijs {formatEur(forSale.asking)}, markt {formatEur(forSale.value)}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {market.graded > 0 && (
        <p className="muted small">
          {countLabel(market.graded, 'gegradeerde kaart telt', 'gegradeerde kaarten tellen')} mee tegen de
          ongegradeerde prijs.
        </p>
      )}
    </div>
  )
}

export function DashboardPage(): JSX.Element {
  const [data, setData] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((cards) => {
        if (!cancelled) setData(cards)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const stats = useMemo(() => (data ? computeStats(data) : null), [data])
  const { prices, loading: pricesLoading } = useMarketPrices(data)
  const market = useMemo(() => (data ? summarizeMarket(data, prices) : null), [data, prices])

  if (error) {
    return (
      <section className="page">
        <div className="notice" role="alert">
          <p className="error">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setReloadKey((k) => k + 1)
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </section>
    )
  }
  if (!stats || !data) return <p className="center" aria-live="polite">Laden…</p>

  if (data.length === 0) {
    return (
      <section className="page">
        <p className="empty">
          Nog geen kaarten. <a href="#/import">Importeer je Excel</a> of voeg een kaart toe via Collectie.
        </p>
      </section>
    )
  }

  const listed = stats.sold.count + stats.forSale.count
  const netLabel = stats.net > 0 ? 'Winst' : stats.net < 0 ? 'Nog terug te verdienen' : 'Quitte'

  return (
    <section className="page dashboard">
      <div className="hero">
        <p className="stat-label">Netto: verkocht min gekocht</p>
        <p className="hero-value">{formatEur(stats.net)}</p>
        <p className="muted">{netLabel}</p>
      </div>

      <div className="stat-row">
        <Tile label="Verkocht" bucket={stats.sold} unit={countLabel(stats.sold.count, 'kaart', 'kaarten')} href="#/collectie" />
        <Tile label="Te koop" bucket={stats.forSale} unit={countLabel(stats.forSale.count, 'kaart', 'kaarten')} href="#/collectie" />
        <Tile label="Gekocht" bucket={stats.bought} unit={countLabel(stats.bought.count, 'stuk', 'stuks')} href="#/collectie" />
        <Tile
          label="In collectie (aankoopwaarde)"
          bucket={stats.collection}
          unit={countLabel(stats.collection.count, 'stuk', 'stuks')}
          href="#/collectie"
        />
      </div>

      <div className="panel">
        <div className="meter-head">
          <span className="stat-label" id="ratio-label">Verkoopratio</span>
          <span className="meter-value">{pct.format(stats.sellRatio)}</span>
        </div>
        <div
          className="meter"
          role="meter"
          aria-labelledby="ratio-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(stats.sellRatio * 1000) / 10}
          aria-valuetext={`${stats.sold.count} van ${listed} kaarten verkocht`}
        >
          <span className="meter-fill" style={{ width: `${stats.sellRatio * 100}%` }} />
        </div>
        <p className="muted small">
          {stats.sold.count} van {countLabel(listed, 'kaart', 'kaarten')} op je verkooplijst verkocht
        </p>
      </div>

      {market && <MarketPanel market={market} loading={pricesLoading} />}

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
