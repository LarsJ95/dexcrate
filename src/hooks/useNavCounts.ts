import { useEffect, useState } from 'react'
import { listCards } from '../lib/db'
import { NO_COUNTS, dealsWithinMax, unlinkedCount, wishesWithMax, type NavCounts } from '../lib/navCounts'
import { CRATE_CHANGED_EVENT, getCrateStatus } from '../lib/crate'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import { hasWishlist, listWishlist } from '../lib/wishlist'

/** Een minuut vers; bij een andere pagina daarna opnieuw tellen. */
const FRESH_MS = 60_000
let cached: { at: number; promise: Promise<NavCounts> } | null = null

async function load(): Promise<NavCounts> {
  const cards = await listCards()
  // Elk getal los: mislukt er één (bv. oude database zonder Crate), dan blijven de andere staan.
  const crate = getCrateStatus().catch(() => null)
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
  return { collection: unlinkedCount(cards), wishlist: await wishlist, crate: await crate }
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

  // Crate points veranderd (pakje, inruilen, beheer …): alleen dat getal meteen opnieuw ophalen (21-10-2026: het menu
  // bleef anders tot een minuut op de oude stand staan). Kort wachten, zodat een reeks wijzigingen één opvraging is.
  useEffect(() => {
    let cancelled = false
    let timer = 0
    const refresh = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        getCrateStatus()
          .then((crate) => {
            if (cached) cached = { at: cached.at, promise: cached.promise.then((c) => ({ ...c, crate })) }
            if (!cancelled) setCounts((c) => ({ ...c, crate }))
          })
          .catch((err: unknown) => console.warn('Crate points voor het menu ophalen mislukt', err))
      }, 250)
    }
    window.addEventListener(CRATE_CHANGED_EVENT, refresh)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener(CRATE_CHANGED_EVENT, refresh)
    }
  }, [])

  return counts
}
