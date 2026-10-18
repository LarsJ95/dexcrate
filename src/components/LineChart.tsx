import { useEffect, useId, useMemo, useRef, useState, type JSX, type PointerEvent } from 'react'
import { formatEur } from '../lib/stats'

export interface Point {
  date: string
  value: number
}

/** Startbreedte; daarna de echte breedte van het vak, zodat tekst niet mee-schaalt. */
const DEFAULT_W = 600
/** Standaardhoogte; Overview gebruikt een lagere grafiek (alles in één oogopslag). */
const DEFAULT_H = 170
const PAD = { top: 12, right: 12, bottom: 28, left: 64 }

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const parseDate = (d: string): Date => new Date(`${d}T00:00:00`)

/** Lijngrafiek van één reeks met hover-tooltip en tabelweergave (toegankelijk alternatief). */
export function LineChart({
  points,
  label,
  valueLabel = 'Trend price',
  height = DEFAULT_H,
}: {
  points: Point[]
  label: string
  valueLabel?: string
  /** Hoogte in px (de breedte volgt het vak). */
  height?: number
}): JSX.Element {
  const H = height
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(DEFAULT_W)

  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    // Vlak onder de lijn (decoratief, in de typekleur).
    const bottom = (H - PAD.bottom).toFixed(1)
    const area = `${path}L${x(points.length - 1).toFixed(1)},${bottom}L${x(0).toFixed(1)},${bottom}Z`
    return { min, max, x, y, path, area }
  }, [points, W, H])

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
      <div className="chart-box" ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: from ${formatEur(points[0].value)} to ${formatEur(points[points.length - 1].value)}`}>
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
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="area-top" />
              <stop offset="1" className="area-bottom" />
            </linearGradient>
          </defs>
          <path className="area" d={geo.area} fill={`url(#${CSS.escape(gradientId)})`} />
          <path className="line" d={geo.path} />
          {/* Eindpunt als pokébal: de huidige waarde. */}
          <g className="end-ball" transform={`translate(${geo.x(points.length - 1).toFixed(1)},${geo.y(points[points.length - 1].value).toFixed(1)})`} aria-hidden="true">
            <path d="M-6,0 A6,6 0 0 1 6,0 Z" className="ball-top" />
            <path d="M-6,0 A6,6 0 0 0 6,0 Z" className="ball-bottom" />
            <line x1="-6" x2="6" y1="0" y2="0" className="ball-line" />
            <circle r="6" className="ball-ring" />
            <circle r="2" className="ball-button" />
          </g>
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
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">{valueLabel}</th></tr>
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
