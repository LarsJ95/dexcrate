import { useEffect, useState } from 'react'
import type { CardInput } from '../lib/types'
import { hasValuations, loadSettings } from '../lib/valuationDb'
import { useDbFeature } from './useDbFeature'

/** Standaardwaarden voor een nieuwe kaart uit je instellingen (alleen ingevulde velden). */
export function useNewCardDefaults(): Partial<CardInput> {
  const enabled = useDbFeature(hasValuations, 'valuations') === true
  const [defaults, setDefaults] = useState<Partial<CardInput>>({})
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    loadSettings()
      .then((s) => {
        if (cancelled) return
        const d: Partial<CardInput> = {}
        if (s.defaults.language) d.language = s.defaults.language
        if (s.defaults.condition) d.condition = s.defaults.condition
        if (s.defaults.set_code) d.set_code = s.defaults.set_code
        setDefaults(d)
      })
      .catch((err: unknown) => console.warn('Standaardwaarden laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [enabled])
  return defaults
}
