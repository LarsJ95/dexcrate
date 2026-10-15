import { useEffect, useState } from 'react'
import { hasSchemaV2 } from '../lib/db'

/** True als STAP4 in de database staat; undefined zolang dat nog gecontroleerd wordt. */
export function useSchemaV2(): boolean | undefined {
  const [v2, setV2] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    hasSchemaV2()
      .then((ok) => {
        if (!cancelled) setV2(ok)
      })
      .catch((err: unknown) => {
        // Onbekend: veilig uitgaan van het oude schema (nieuwe velden verborgen).
        console.warn('Databaseversie controleren mislukt', err)
        if (!cancelled) setV2(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return v2
}
