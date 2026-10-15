import type { JSX } from 'react'

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 0 })

/** Prijsbeweging met pijl én teken, zodat het niet alleen via kleur leesbaar is. Kleine bewegingen = neutraal. */
export function ChangeBadge({ change, label = 'vs 30-day average' }: { change: number | null; label?: string }): JSX.Element | null {
  if (change === null || !Number.isFinite(change)) return null
  const flat = Math.abs(change) < 0.02
  const dir = flat ? 'flat' : change > 0 ? 'up' : 'down'
  const text = flat ? '±0%' : `${change > 0 ? '+' : '−'}${pct.format(Math.abs(change))}`
  return (
    <span className={`change ${dir}`} title={`${text} ${label}`}>
      <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}</span>
      {text}
      <span className="visually-hidden"> {label}</span>
    </span>
  )
}
