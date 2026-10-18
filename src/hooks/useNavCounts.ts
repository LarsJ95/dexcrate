import { useEffect, useState } from 'react'
import { listCards } from '../lib/db'
import { NO_COUNTS, dealsWithinMax, unlinkedCount, wishesWithMax, type NavCounts } from '../lib/navCounts'
import { listInboxPhotos } from '../lib/photos'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import { hasWishlist, listWishlist } from '../lib/wishlist'

/** Een minuut vers; bij een andere pagina daarna opnieuw tellen. */
const FRESH_MS = 60_000
let cached: { at: number; promise: Promise<NavCounts> } | null = null

async function load(): Promise<NavCounts> {
  const cards = await listCards()
  // Elk getal los: mislukt er één (bv. oude database zonder foto-inbox), dan blijven de andere staan.
  const photos = listInboxPhotos()
    .then((rows) => rows.length)
    .catch(() => 0)
  const wishlist = (async () => {
    if (!(await hasWishlist())) return 0
    const items = await listWishlist()
    const keys = [...new Set(wishesWithMax(items).map((i) => i.tcgdex_id as string))]
    const prices = new Map<string, CardmarketPrice | null>()
    await Promise.all(
      keys.map(async (k) => {
        prices.set(k, await getCardPrice(k).catch(() => null))
      }),
    )
    return dealsWithinMax(items, cards, prices)
  })().catch(() => 0)
  return { collection: unlinkedCount(cards), wishlist: await wishlist, photos: await photos }
}

/** Menu-getallen; telt opnieuw bij het wisselen van pagina als de vorige telling ouder is dan een minuut. */
export function useNavCounts(route: string): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(NO_COUNTS)

  useEffect(() => {
    let cancelled = false
    if (!cached || Date.now() - cached.at > FRESH_MS) {
      const promise = load()
      cached = { at: Date.now(), promise }
      promise.catch(() => {
        cached = null // volgende keer opnieuw
      })
    }
    cached.promise
      .then((c) => {
        if (!cancelled) setCounts(c)
      })
      .catch((err: unknown) => console.warn('Menu-getallen tellen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [route])

  return counts
}
