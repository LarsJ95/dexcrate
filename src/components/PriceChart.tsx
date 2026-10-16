import { useEffect, useMemo, useState, type JSX } from 'react'
import { listSnapshots, type PriceSnapshot } from '../lib/db'
import { LineChart, type Point } from './LineChart'

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const pctFmt = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 0 })

/** Prijsverloop van één kaart uit de dagelijkse opnames; toont niets zolang er te weinig data is. */
export function PriceChart({ tcgdexId, reverse }: { tcgdexId: string; reverse: boolean }): JSX.Element | null {
  const [rows, setRows] = useState<{ key: string; rows: PriceSnapshot[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    listSnapshots(tcgdexId)
      .then((r) => {
        if (!cancelled) setRows({ key: tcgdexId, rows: r })
      })
      .catch((err: unknown) => console.warn('Prijsverloop niet beschikbaar', err))
    return () => {
      cancelled = true
    }
  }, [tcgdexId])

  const points = useMemo<Point[]>(() => {
    if (!rows || rows.key !== tcgdexId) return []
    return rows.rows.flatMap((r) => {
      const v = reverse ? r.trendHolo : r.trend
      return v === null ? [] : [{ date: r.takenOn, value: v }]
    })
  }, [rows, tcgdexId, reverse])

  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const change = first.value > 0 ? last.value / first.value - 1 : 0
  const since = dayFmt.format(new Date(`${first.date}T00:00:00`))
  const text = Math.abs(change) < 0.005 ? `unchanged since ${since}` : `${change > 0 ? '+' : '−'}${pctFmt.format(Math.abs(change))} since ${since}`
  return <LineChart points={points} label={`Price history: ${text}`} />
}
