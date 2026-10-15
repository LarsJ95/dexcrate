import { useEffect, useState } from 'react'

/**
 * Laadt iets per sleutel (bv. een kaart-id). undefined = laden, null = geen sleutel of mislukt.
 * De loader moet stabiel zijn (module-functie), anders wordt elke render opnieuw geladen.
 */
export function useKeyed<T>(key: string | null, loader: (key: string) => Promise<T | null>): T | null | undefined {
  const [state, setState] = useState<{ key: string | null; value: T | null | undefined }>({ key, value: key ? undefined : null })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    loader(key)
      .then((value) => {
        if (!cancelled) setState({ key, value })
      })
      .catch((err: unknown) => {
        console.warn(`Laden mislukt voor ${key}`, err)
        if (!cancelled) setState({ key, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [key, loader])

  if (!key) return null
  return state.key === key ? state.value : undefined
}
