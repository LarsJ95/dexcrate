import { useEffect, useState } from 'react'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'

/**
 * Cardmarket-prijzen voor een lijst sleutels, alleen als `enabled` (bv. bij een prijsfilter).
 * Ontbrekend in de map = nog aan het laden; null = geen prijs of ophalen mislukt.
 */
export function useCardPrices(keys: readonly string[], enabled: boolean): ReadonlyMap<string, CardmarketPrice | null> {
  const [prices, setPrices] = useState<ReadonlyMap<string, CardmarketPrice | null>>(new Map())
  const list = enabled ? [...new Set(keys)].sort().join('\n') : ''

  useEffect(() => {
    if (!list) return
    let cancelled = false
    const todo = list.split('\n')
    const found = new Map<string, CardmarketPrice | null>()
    let done = 0
    for (const key of todo) {
      getCardPrice(key)
        .then((p) => found.set(key, p))
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${key}`, err)
          found.set(key, null)
        })
        .finally(() => {
          done += 1
          if (!cancelled && (done % 10 === 0 || done === todo.length)) setPrices(new Map(found))
        })
    }
    return () => {
      cancelled = true
    }
  }, [list])

  return prices
}
