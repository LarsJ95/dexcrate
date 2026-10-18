import { useEffect, useMemo, useState, type JSX } from 'react'
import { useCardPrices } from '../hooks/useCardPrices'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { cardLanguageOf, cardmarketUrl } from '../lib/cardmarket'
import { errorText } from '../lib/errors'
import { formatEur } from '../lib/stats'
import type { Card } from '../lib/types'
import { wishDeals } from '../lib/wishDeals'
import { listWishlist, type WishlistItem } from '../lib/wishlist'
import { CardImage } from './CardImage'
import { ChangeBadge } from './ChangeBadge'

/**
 * Overview: wensen die nu goed te koop zijn (binnen je max. prijs, of flink gedaald), in dezelfde vorm als
 * Gainers en Losers. Tik = Cardmarket in een nieuw tabblad.
 */
export function WishDeals({ cards }: { cards: readonly Card[] }): JSX.Element {
  const enabled = useWishlistEnabled() === true
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    listWishlist()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading your wishlist failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const keys = useMemo(() => (items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : [])), [items])
  const prices = useCardPrices(keys, keys.length > 0)
  const deals = useMemo(() => wishDeals(items ?? [], cards, prices), [items, cards, prices])
  const loading = enabled && (items === null || (keys.length > 0 && prices.size < new Set(keys).size && deals.length < 5))

  return (
    <div className="panel">
      <h2 className="panel-title">Wishlist deals</h2>
      <p className="flavor">A wild deal appeared!</p>
      {error ? (
        <p className="error small">{error}</p>
      ) : deals.length > 0 ? (
        <ol className="mover-list">
          {deals.map(({ item, market, withinMax }) => (
            <li key={item.id}>
              <a
                className="mover"
                href={cardmarketUrl(prices.get(item.tcgdex_id ?? '')?.idProduct ?? null, [item.name, item.card_number].filter(Boolean).join(' '), cardLanguageOf(item.language, item.tcgdex_id))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.name}${item.card_number ? ` #${item.card_number}` : ''}, ${formatEur(market.value)}: view on Cardmarket (opens in a new tab)`}
              >
                <span aria-hidden="true">
                  <CardImage tcgdexId={item.tcgdex_id} kind="card" name={item.name} detail={[item.set_code, item.card_number && `#${item.card_number}`].filter(Boolean).join(' ')} />
                </span>
                <span className="mover-name">
                  {item.name}
                  {item.card_number && <span className="muted"> #{item.card_number}</span>}
                </span>
                <span className="mover-price">
                  {formatEur(market.value)}
                  {withinMax && item.max_price !== null ? (
                    <span className="change up">≤ max {formatEur(item.max_price)}</span>
                  ) : (
                    <ChangeBadge change={market.change30} />
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : loading ? (
        <p className="muted small">Checking prices…</p>
      ) : (
        <p className="muted small">
          No open wishes with a market price yet. <a href="#/wishlist">Add cards to your wishlist</a>.
        </p>
      )}
    </div>
  )
}
