import { useEffect, useMemo, useState, type JSX } from 'react'
import { useCardPrices } from '../hooks/useCardPrices'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { listWishlist, type WishlistItem } from '../lib/wishlist'
import { celebrateDeals } from '../lib/celebrate'
import { CardImage } from './CardImage'

const MAX_SHOWN = 5

/** Koopkansen: wensen waarvan de marktprijs binnen jouw max. prijs valt, grootste marge eerst. */
export function BuyingChances(): JSX.Element | null {
  const enabled = useWishlistEnabled()
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    listWishlist()
      .then((w) => {
        if (!cancelled) setItems(w)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading the wishlist failed.')
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const withMax = useMemo(() => (items ?? []).filter((i) => i.tcgdex_id && i.max_price !== null), [items])
  const prices = useCardPrices(
    withMax.map((i) => i.tcgdex_id as string),
    withMax.length > 0,
  )
  const chances = useMemo(
    () =>
      withMax
        .flatMap((item) => {
          const market = marketValue(prices.get(item.tcgdex_id as string) ?? null, item.variant)?.value ?? null
          return market !== null && item.max_price !== null && market <= item.max_price ? [{ item, market, margin: item.max_price - market }] : []
        })
        .sort((a, b) => b.margin - a.margin),
    [withMax, prices],
  )

  // Nieuwe koopkans sinds vorige keer: "A deal appeared!" (pas als alle prijzen binnen zijn).
  const pricesDone = withMax.every((i) => prices.has(i.tcgdex_id as string))
  const dealKey = chances.map((c) => c.item.id).join(',')
  useEffect(() => {
    if (items === null || !pricesDone) return
    celebrateDeals(chances.map((c) => ({ id: c.item.id, name: c.item.name, market: c.market, max: c.item.max_price ?? 0, tcgdexId: c.item.tcgdex_id })))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij een andere set koopkansen
  }, [dealKey, pricesDone, items === null])

  if (enabled !== true) return null

  return (
    <section className="panel buying-chances" aria-labelledby="chances-title">
      <h2 id="chances-title" className="panel-title">
        Buying chances
      </h2>
      <p className="flavor">Wishes at or below your max. price.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items !== null && chances.length === 0 && (
        <p className="muted small">
          {withMax.length === 0 ? 'Set a max. price on a wish to see chances here.' : 'Nothing within your max. right now.'}
        </p>
      )}
      {chances.length > 0 && (
        <ol className="mover-list">
          {chances.slice(0, MAX_SHOWN).map(({ item, market }) => (
            <li key={item.id}>
              <a className="mover" href="#/wishlist">
                <span aria-hidden="true">
                  <CardImage tcgdexId={item.tcgdex_id} kind="card" name={item.name} detail={item.card_number ? `#${item.card_number}` : null} />
                </span>
                <span className="mover-name">
                  {item.name}
                  {item.card_number && <span className="muted"> #{item.card_number}</span>}
                </span>
                <span className="mover-price">
                  {formatEur(market)}
                  <span className="muted small">max. {formatEur(item.max_price ?? 0)}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
      <a className="small" href="#/wishlist">
        Open wishlist
      </a>
    </section>
  )
}
