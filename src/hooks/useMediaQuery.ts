import { useCallback, useSyncExternalStore } from 'react'

/** Past het scherm bij deze media query (bv. "(max-width: 480px)")? Volgt draaien en venstergrootte live. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== 'function') return () => undefined
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    [query],
  )
  const get = (): boolean => typeof matchMedia === 'function' && matchMedia(query).matches
  return useSyncExternalStore(subscribe, get, () => false)
}

/** Telefoonbreedte (DESIGN.md §5, breekpunt 480). */
export const PHONE_QUERY = '(max-width: 480px)'
