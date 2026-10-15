import { useEffect, useState } from 'react'
import { hasTransactions } from '../lib/transactions'

/** True als STAP5 (transacties) in de database staat; undefined zolang dat gecontroleerd wordt. */
export function useTransactionsEnabled(): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    hasTransactions()
      .then((ok) => {
        if (!cancelled) setEnabled(ok)
      })
      .catch((err: unknown) => {
        // Onbekend: veilig uitgaan van "nog niet" (oude werkwijze blijft beschikbaar).
        console.warn('Transacties controleren mislukt', err)
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return enabled
}
