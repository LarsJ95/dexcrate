import { useEffect, useMemo, useState, type JSX } from 'react'
import { listItems } from '../lib/db'
import { computeStats, formatEur, type Bucket } from '../lib/stats'
import type { Purchase, Sale } from '../lib/types'

interface Data {
  sales: Sale[]
  purchases: Purchase[]
}

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

export function DashboardPage(): JSX.Element {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([listItems('sales'), listItems('purchases')])
      .then(([sales, purchases]) => {
        if (!cancelled) setData({ sales, purchases })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const stats = useMemo(() => (data ? computeStats(data.sales, data.purchases) : null), [data])

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

  if (data.sales.length === 0 && data.purchases.length === 0) {
    return (
      <section className="page">
        <p className="empty">
          Nog geen kaarten. <a href="#/import">Importeer je Excel</a> of voeg een kaart toe via Verkoop.
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
        <Tile label="Verkocht" bucket={stats.sold} unit={countLabel(stats.sold.count, 'kaart', 'kaarten')} href="#/verkoop" />
        <Tile label="Te koop" bucket={stats.forSale} unit={countLabel(stats.forSale.count, 'kaart', 'kaarten')} href="#/verkoop" />
        <Tile label="Gekocht" bucket={stats.bought} unit={countLabel(stats.bought.count, 'stuk', 'stuks')} href="#/aankopen" />
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
