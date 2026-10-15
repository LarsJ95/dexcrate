import { useEffect, useMemo, useState, type JSX } from 'react'
import { DashboardView } from '../components/DashboardView'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards, listSnapshotsFor } from '../lib/db'
import { portfolioSeries, type SnapshotRow } from '../lib/prices'
import type { Card } from '../lib/types'

export function DashboardPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((rows) => {
        if (cancelled) return
        setCards(rows)
        const keys = [...new Set(rows.filter((c) => c.status !== 'sold' && c.tcgdex_id).map((c) => c.tcgdex_id as string))]
        // Waardeverloop is een extraatje: zonder (nog geen opnames, of STAP2 niet gedraaid) werkt de rest gewoon.
        return listSnapshotsFor(keys)
          .then((rows2) => {
            if (!cancelled) setSnapshots(rows2)
          })
          .catch((err: unknown) => {
            console.warn('Waardeverloop niet beschikbaar', err)
            if (!cancelled) setSnapshots([])
          })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const { prices, loading } = useMarketPrices(cards)
  const series = useMemo(() => (cards && snapshots ? portfolioSeries(cards, snapshots) : null), [cards, snapshots])

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
  if (!cards) return <p className="center" aria-live="polite">Laden…</p>
  return <DashboardView cards={cards} prices={prices} pricesLoading={loading} series={series} />
}
