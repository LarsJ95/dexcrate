import { useEffect, useState } from 'react'
import { listCards } from '../lib/db'
import type { Card } from '../lib/types'

const FRESH_MS = 60_000
let cached: { at: number; promise: Promise<Card[]> } | null = null

/** Je kaarten, kort gedeeld tussen popups (één verzoek per minuut); null zolang ze laden of bij een fout. */
export function useOwnedCards(): Card[] | null {
  const [cards, setCards] = useState<Card[] | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!cached || Date.now() - cached.at > FRESH_MS) {
      const promise = listCards()
      cached = { at: Date.now(), promise }
      promise.catch(() => {
        cached = null // mislukt: volgende keer opnieuw
      })
    }
    cached.promise
      .then((list) => {
        if (!cancelled) setCards(list.filter((c) => c.ownership === 'owned'))
      })
      .catch((err: unknown) => console.warn('Je kaarten laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])

  return cards
}
