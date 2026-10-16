import type { JSX } from 'react'
import { IconArrowDown, IconArrowUp, IconMinus } from './Icons'

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 0 })

/** Prijsbeweging met pijl én teken, zodat het niet alleen via kleur leesbaar is. Kleine bewegingen = neutraal. */
export function ChangeBadge({ change, label = 'vs 30-day average', showLabel = false }: { change: number | null; label?: string; showLabel?: boolean }): JSX.Element | null {
  if (change === null || !Number.isFinite(change)) return null
  const flat = Math.abs(change) < 0.02
  const dir = flat ? 'flat' : change > 0 ? 'up' : 'down'
  const text = flat ? '±0%' : `${change > 0 ? '+' : '−'}${pct.format(Math.abs(change))}`
  return (
    <span className={`change ${dir}`} title={`${text} ${label}`}>
      {dir === 'up' ? <IconArrowUp size={14} /> : dir === 'down' ? <IconArrowDown size={14} /> : <IconMinus size={14} />}
      {text}
      {showLabel ? <span className="change-label"> {label}</span> : <span className="visually-hidden"> {label}</span>}
    </span>
  )
}
