import { useEffect, useState } from 'react'
import { isNetworkError } from '../lib/errors'

const KEY = 'dexcrate:db-feature:'

/** Laatst gemeten uitslag op dit apparaat (voor offline gebruik); undefined = nooit gemeten. */
function remembered(name: string): boolean | undefined {
  try {
    const v = localStorage.getItem(KEY + name)
    return v === '1' ? true : v === '0' ? false : undefined
  } catch {
    return undefined // geen opslag: dan gewoon opnieuw meten
  }
}

function remember(name: string, ok: boolean): void {
  try {
    localStorage.setItem(KEY + name, ok ? '1' : '0')
  } catch (err) {
    console.warn('Databaseonderdeel onthouden mislukt', err)
  }
}

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * Of een database-onderdeel (STAP4, STAP5, ...) beschikbaar is; undefined zolang dat gecontroleerd wordt.
 * Bij een fout veilig "nee", behalve zonder internet: dan de laatst gemeten uitslag van dit apparaat,
 * zodat offline bewaarde gegevens (bv. de wishlist) zichtbaar blijven.
 */
export function useDbFeature(check: () => Promise<boolean>, name: string): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(() => (isOffline() ? remembered(name) : undefined))

  useEffect(() => {
    // Zeker offline en al eens gemeten: niet wachten op een verzoek dat toch faalt.
    if (isOffline() && remembered(name) !== undefined) return
    let cancelled = false
    check()
      .then((ok) => {
        remember(name, ok)
        if (!cancelled) setEnabled(ok)
      })
      .catch((err: unknown) => {
        console.warn('Databaseonderdeel controleren mislukt', err)
        if (!cancelled) setEnabled(isNetworkError(err) ? (remembered(name) ?? false) : false)
      })
    return () => {
      cancelled = true
    }
  }, [check, name])

  return enabled
}
