import { useEffect, useMemo, useState } from 'react'
import type { PriceMap } from '../lib/prices'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import type { CardInput } from '../lib/types'

/** Haalt Cardmarket-prijzen op voor alle gekoppelde kaarten. `loading` tot alle verzoeken klaar zijn. */
export function useMarketPrices(cards: readonly CardInput[] | null): { prices: PriceMap; loading: boolean } {
  // Stabiele sleutel zodat bewerken van prijs/status niet opnieuw alles ophaalt.
  const keyList = useMemo(() => {
    const keys = new Set<string>()
    for (const c of cards ?? []) if (c.kind === 'card' && c.tcgdex_id) keys.add(c.tcgdex_id)
    return [...keys].sort().join('|')
  }, [cards])

  const [state, setState] = useState<{ keyList: string; prices: PriceMap }>({ keyList: '', prices: new Map() })

  useEffect(() => {
    if (!keyList) return
    let cancelled = false
    const keys = keyList.split('|')
    Promise.allSettled(keys.map((k) => getCardPrice(k))).then((results) => {
      if (cancelled) return
      const map = new Map<string, CardmarketPrice | null>()
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') map.set(keys[i], r.value)
        else console.error(`Prijs ophalen mislukt voor ${keys[i]}`, r.reason)
      })
      setState({ keyList, prices: map })
    })
    return () => {
      cancelled = true
    }
  }, [keyList])

  return { prices: state.prices, loading: keyList !== '' && state.keyList !== keyList }
}
