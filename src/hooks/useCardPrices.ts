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
    // Hoogstens elke 250 ms opnieuw renderen (24-10-2026: was elke 10 resultaten; bij honderden kaarten traag).
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = (): void => {
      timer = null
      if (!cancelled) setPrices(new Map(found))
    }
    for (const key of todo) {
      getCardPrice(key)
        .then((p) => found.set(key, p))
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${key}`, err)
          found.set(key, null)
        })
        .finally(() => {
          done += 1
          if (done < todo.length) timer ??= setTimeout(flush, 250)
          else {
            if (timer) clearTimeout(timer)
            flush()
          }
        })
    }
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [list])

  return prices
}
