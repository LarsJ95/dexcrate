import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardDialog } from '../components/CardDialog'
import { DashboardView } from '../components/DashboardView'
import { ValueBreakdown } from '../components/ValueBreakdown'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards, listSnapshotsFor } from '../lib/db'
import { portfolioSeries, type SnapshotRow } from '../lib/prices'
import type { Card } from '../lib/types'
import { Loading } from '../components/Loading'
import { COLLECTION_MILESTONES, celebrateMilestone } from '../lib/moments'
import { trainerName } from '../lib/trainer'
import { errorText } from '../lib/errors'

const COLLECTION_MILESTONE_KEY = 'dexcrate:collection-milestone'

export function DashboardPage({ email = null }: { email?: string | null }): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

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
        if (!cancelled) setError(errorText(err, 'Loading failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Mijlpaal voor de hele collectie (10, 25, 50, 100 … kaarten in bezit).
  useEffect(() => {
    if (!cards) return
    const owned = cards.reduce((n, c) => n + (c.ownership === 'owned' ? c.quantity : 0), 0)
    celebrateMilestone(COLLECTION_MILESTONE_KEY, owned, COLLECTION_MILESTONES, (n) => `${n} cards in your collection`)
  }, [cards])

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
            Try again
          </button>
        </div>
      </section>
    )
  }
  if (!cards) return <Loading center />

  const openCard = openId ? (cards.find((c) => c.id === openId) ?? null) : null

  return (
    <>
      <DashboardView
        cards={cards}
        prices={prices}
        pricesLoading={loading}
        series={series}
        onOpenCard={setOpenId}
        trainer={trainerName(email)}
        breakdown={<ValueBreakdown cards={cards} prices={prices} pricesLoading={loading} snapshots={snapshots} />}
      />
      {openCard && (
        <CardDialog
          key={openCard.id}
          card={openCard}
          defaultStatus={openCard.status}
          nextSortOrder={cards.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1}
          onClose={() => setOpenId(null)}
          onSaved={(rows) => {
            setCards((list) => {
              const next = [...(list ?? [])]
              for (const row of rows) {
                const i = next.findIndex((c) => c.id === row.id)
                if (i >= 0) next[i] = row
                else next.push(row)
              }
              return next
            })
            setOpenId(null)
          }}
          onChanged={(row) => setCards((list) => list?.map((c) => (c.id === row.id ? row : c)) ?? null)}
          onDeleted={(id) => {
            setCards((list) => list?.filter((c) => c.id !== id) ?? null)
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}
