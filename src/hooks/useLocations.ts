import { useEffect, useState } from 'react'
import type { Location } from '../lib/binder'
import { cachedLocations } from '../lib/locations'

/** Locaties (leeg zolang ze laden of als STAP4 ontbreekt). */
export function useLocations(enabled: boolean): Location[] {
  const [list, setList] = useState<Location[]>([])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    cachedLocations()
      .then((l) => {
        if (!cancelled) setList(l)
      })
      .catch((err: unknown) => console.warn('Locaties laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [enabled])
  return list
}
