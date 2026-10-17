import { useCallback, useEffect, useRef, useState } from 'react'
import { marketValue } from '../lib/prices'
import { getCardPrice, isLang, type SetCard } from '../lib/tcgdex'

/** Marktwaarde per kaart-id, met voortgang van het laden. */
export interface SetValues {
  prices: ReadonlyMap<string, number | null>
  done: number
  total: number
}

/**
 * Marktprijs (standaarduitvoering) van elke kaart in een set, voor sorteren op waarde.
 * Laadt pas als `enabled` (één keer per bezoek); prijzen worden 6 uur gecachet.
 */
export function useSetValues(lang: string, cards: readonly SetCard[] | null, enabled: boolean): SetValues | null {
  const [values, setValues] = useState<SetValues | null>(null)
  const started = useRef(false)
  const cancelled = useRef(false)

  // Lopend laden stoppen bij verlaten van de pagina.
  useEffect(
    () => () => {
      cancelled.current = true
    },
    [],
  )

  const load = useCallback((): void => {
    if (!cards || !isLang(lang) || started.current) return
    started.current = true
    cancelled.current = false
    const prices = new Map<string, number | null>()
    let done = 0
    const total = cards.length
    for (const c of cards) {
      getCardPrice(`${lang}/${c.id}`)
        .then((p) => prices.set(c.id, marketValue(p, null)?.value ?? null))
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${c.id}`, err)
          prices.set(c.id, null)
        })
        .finally(() => {
          done += 1
          if (!cancelled.current && (done % 10 === 0 || done === total)) setValues({ prices: new Map(prices), done, total })
        })
    }
  }, [cards, lang])

  // Sorteren op waarde: prijzen laden zodra de set er is.
  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  return values
}
