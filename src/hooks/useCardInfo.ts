import { useEffect, useState } from 'react'
import { getCardInfo, type CardInfo } from '../lib/tcgdex'

/** undefined = laden, null = geen koppeling of niet gevonden. */
export function useCardInfo(key: string | null): CardInfo | null | undefined {
  const [state, setState] = useState<{ key: string | null; info: CardInfo | null | undefined }>({
    key,
    info: key ? undefined : null,
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    getCardInfo(key)
      .then((info) => {
        if (!cancelled) setState({ key, info })
      })
      .catch((err: unknown) => {
        console.error(`Kaartinfo ${key} ophalen mislukt`, err)
        if (!cancelled) setState({ key, info: null })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  if (!key) return null
  return state.key === key ? state.info : undefined
}
