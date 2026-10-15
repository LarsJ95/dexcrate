import { useEffect, useMemo, useState, type JSX, type PointerEvent } from 'react'
import { listSnapshots, type PriceSnapshot } from '../lib/db'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import type { Variant } from '../lib/types'

interface Props {
  tcgdexId: string
  variant: Variant | null
}

interface Point {
  date: string
  value: number
}

const W = 600
const H = 170
const PAD = { top: 12, right: 12, bottom: 24, left: 52 }

const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const parseDate = (d: string): Date => new Date(`${d}T00:00:00`)

function LineChart({ points, label }: { points: Point[]; label: string }): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)

  const geo = useMemo(() => {
    const values = points.map((p) => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min *= 0.9
      max *= 1.1
    }
    const span = max - min
    min = Math.max(0, min - span * 0.1)
    max += span * 0.1
    const x = (i: number): number => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right)
    const y = (v: number): number => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom)
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
    return { min, max, x, y, path }
  }, [points])

  function onMove(e: PointerEvent<SVGRectElement>): void {
    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const ratio = (px - PAD.left) / (W - PAD.left - PAD.right)
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
  }

  const active = hover !== null ? points[hover] : null
  const ticks = [geo.min, (geo.min + geo.max) / 2, geo.max]

  return (
    <figure className="chart">
      <figcaption className="stat-label">{label}</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: van ${formatEur(points[0].value)} naar ${formatEur(points[points.length - 1].value)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
              <text className="axis" x={PAD.left - 6} y={geo.y(t)} textAnchor="end" dominantBaseline="middle">
                {formatEur(t)}
              </text>
            </g>
          ))}
          <text className="axis" x={PAD.left} y={H - 6}>{dateFmt.format(parseDate(points[0].date))}</text>
          <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
            {dateFmt.format(parseDate(points[points.length - 1].date))}
          </text>
          <path className="line" d={geo.path} />
          {active && hover !== null && (
            <g>
              <line className="crosshair" x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
              <circle className="dot" cx={geo.x(hover)} cy={geo.y(active.value)} r={5} />
            </g>
          )}
          <rect
            x={PAD.left}
            y={0}
            width={W - PAD.left - PAD.right}
            height={H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {active && hover !== null && (
          <div
            className="chart-tip"
            style={{ left: `${(geo.x(hover) / W) * 100}%`, top: `${(geo.y(active.value) / H) * 100}%` }}
          >
            <strong>{formatEur(active.value)}</strong>
            <span>{fullDateFmt.format(parseDate(active.date))}</span>
          </div>
        )}
      </div>
      <details>
        <summary>Toon als tabel</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Datum</th><th scope="col">Trendprijs</th></tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date}><td>{fullDateFmt.format(parseDate(p.date))}</td><td>{formatEur(p.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/** Actuele Cardmarket-prijs plus dagelijks opgebouwd prijsverloop. */
export function PriceHistory({ tcgdexId, variant }: Props): JSX.Element {
  const [price, setPrice] = useState<{ key: string; value: CardmarketPrice | null } | null>(null)
  const [history, setHistory] = useState<{ key: string; rows: PriceSnapshot[] } | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCardPrice(tcgdexId)
      .then((value) => {
        if (!cancelled) setPrice({ key: tcgdexId, value })
      })
      .catch((err: unknown) => {
        console.error('Prijs ophalen mislukt', err)
        if (!cancelled) setPrice({ key: tcgdexId, value: null })
      })
    listSnapshots(tcgdexId)
      .then((rows) => {
        if (!cancelled) setHistory({ key: tcgdexId, rows })
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setHistoryError('Prijsverloop is (nog) niet beschikbaar.')
      })
    return () => {
      cancelled = true
    }
  }, [tcgdexId])

  const reverse = variant === 'reverse'
  const current = price?.key === tcgdexId ? price.value : undefined
  const mv = marketValue(current, variant)
  const points = useMemo<Point[]>(() => {
    if (!history || history.key !== tcgdexId) return []
    return history.rows.flatMap((r) => {
      const v = reverse ? r.trendHolo : r.trend
      return v === null ? [] : [{ date: r.takenOn, value: v }]
    })
  }, [history, tcgdexId, reverse])

  if (current === undefined) return <p className="muted" aria-live="polite">Marktprijs laden…</p>

  const avg = (normal: number | null, holo: number | null): string => {
    const v = reverse ? holo : normal
    return v === null ? 'onbekend' : formatEur(v)
  }

  return (
    <div className="price-history">
      {mv ? (
        <p>
          <span className="stat-label">Marktwaarde{reverse ? ' (reverse holo)' : ''}</span>
          <br />
          <span className="stat-value">{formatEur(mv.value)}</span>{' '}
          <span className="muted small">
            {mv.basis === 'trend' ? 'Cardmarket-trend' : mv.basis === 'avg30' ? 'gemiddelde 30 dagen' : 'gemiddelde 7 dagen'}
          </span>
        </p>
      ) : (
        <p className="muted">Geen Cardmarket-prijs bekend{reverse ? ' voor reverse holo' : ''}.</p>
      )}

      {current && (
        <dl className="price-facts">
          <div><dt>Laagste aanbod</dt><dd>{avg(current.low, current.lowHolo)}</dd></div>
          <div><dt>Gem. 1 dag</dt><dd>{avg(current.avg1, current.avg1Holo)}</dd></div>
          <div><dt>Gem. 7 dagen</dt><dd>{avg(current.avg7, current.avg7Holo)}</dd></div>
          <div><dt>Gem. 30 dagen</dt><dd>{avg(current.avg30, current.avg30Holo)}</dd></div>
        </dl>
      )}

      {points.length >= 2 ? (
        <LineChart points={points} label={`Prijsverloop${reverse ? ' reverse holo' : ''}`} />
      ) : (
        <p className="muted small">
          {historyError ?? 'Het prijsverloop wordt vanaf nu dagelijks opgeslagen; na een paar dagen verschijnt hier een grafiek.'}
        </p>
      )}
    </div>
  )
}
