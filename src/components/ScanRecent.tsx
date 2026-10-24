import { useMemo, useState, type JSX } from 'react'
import { useMarketPrices } from '../hooks/useMarketPrices'
import type { Card } from '../lib/types'
import { CardDialog } from './CardDialog'
import { RecentlyAdded } from './OverviewPanels'

interface Props {
  cards: readonly Card[]
  nextSortOrder: number
  /** Kaart bewerkt of verwijderd in de popup: de lijst op de Scan-pagina bijwerken. */
  onChanged: (row: Card) => void
  onDeleted: (id: string) => void
}

/**
 * Scan-pagina (24-10-2026, op verzoek: veel lege ruimte onder de tegels): je laatst toegevoegde kaarten, zoals
 * "Fresh pulls" op Home; tik = kaart openen. Prijzen alleen voor deze paar kaarten.
 */
export function ScanRecent({ cards, nextSortOrder, onChanged, onDeleted }: Props): JSX.Element | null {
  const [openId, setOpenId] = useState<string | null>(null)
  const recent = useMemo(
    () =>
      cards
        .filter((c) => c.ownership === 'owned')
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.sort_order - a.sort_order)
        .slice(0, 8),
    [cards],
  )
  const { prices } = useMarketPrices(recent)
  const open = openId ? (cards.find((c) => c.id === openId) ?? null) : null
  if (recent.length === 0) return null
  return (
    <>
      <RecentlyAdded
        cards={recent}
        prices={prices}
        onOpenCard={setOpenId}
        title="Recently added"
        action={
          <a className="small recent-all" href="#/collection">
            See all <span aria-hidden="true">›</span>
          </a>
        }
      />
      {open && (
        <CardDialog
          key={open.id}
          card={open}
          defaultStatus={open.status}
          nextSortOrder={nextSortOrder}
          onClose={() => setOpenId(null)}
          onSaved={(rows) => {
            for (const row of rows) onChanged(row)
            setOpenId(null)
          }}
          onChanged={onChanged}
          onDeleted={(id) => {
            onDeleted(id)
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}
