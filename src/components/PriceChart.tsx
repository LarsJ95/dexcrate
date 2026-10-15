import { useEffect, useMemo, useState, type JSX } from 'react'
import { listSnapshots, type PriceSnapshot } from '../lib/db'
import { LineChart, type Point } from './LineChart'

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
  return <LineChart points={points} label="Price history" />
}
