import { useEffect, useState } from 'react'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'

/** undefined = laden, null = geen koppeling of geen prijs. */
export function useCardPrice(key: string | null): CardmarketPrice | null | undefined {
  const [state, setState] = useState<{ key: string | null; price: CardmarketPrice | null | undefined }>({
    key,
    price: key ? undefined : null,
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    getCardPrice(key)
      .then((price) => {
        if (!cancelled) setState({ key, price })
      })
      .catch((err: unknown) => {
        console.error(`Prijs ${key} ophalen mislukt`, err)
        if (!cancelled) setState({ key, price: null })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  if (!key) return null
  return state.key === key ? state.price : undefined
}
