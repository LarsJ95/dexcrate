import { useEffect, useState } from 'react'

/**
 * Of een database-onderdeel (STAP4, STAP5, ...) beschikbaar is; undefined zolang dat gecontroleerd wordt.
 * Bij een fout veilig "nee": de app blijft dan werken zoals zonder dat onderdeel.
 */
export function useDbFeature(check: () => Promise<boolean>): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    check()
      .then((ok) => {
        if (!cancelled) setEnabled(ok)
      })
      .catch((err: unknown) => {
        console.warn('Databaseonderdeel controleren mislukt', err)
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [check])

  return enabled
}
