import { useEffect, useState } from 'react'
import { getCardInfo, type CardInfo } from '../lib/tcgdex'

/**
 * Kaartinfo uit de catalogus voor een lijst sleutels, alleen als `enabled` (bv. bij een catalogusfilter).
 * Ontbrekend in de map = nog aan het laden; null = onbekend of ophalen mislukt.
 */
export function useCatalogInfos(keys: readonly string[], enabled: boolean): ReadonlyMap<string, CardInfo | null> {
  const [infos, setInfos] = useState<ReadonlyMap<string, CardInfo | null>>(new Map())
  const list = enabled ? [...new Set(keys)].sort().join('\n') : ''

  useEffect(() => {
    if (!list) return
    let cancelled = false
    const todo = list.split('\n')
    const found = new Map<string, CardInfo | null>()
    let done = 0
    for (const key of todo) {
      getCardInfo(key)
        .then((info) => found.set(key, info))
        .catch((err: unknown) => {
          console.warn(`Kaartinfo ophalen mislukt voor ${key}`, err)
          found.set(key, null)
        })
        .finally(() => {
          done += 1
          if (!cancelled && (done % 10 === 0 || done === todo.length)) setInfos(new Map(found))
        })
    }
    return () => {
      cancelled = true
    }
  }, [list])

  return infos
}
