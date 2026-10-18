import { useCallback, useState } from 'react'

function read(key: string): ReadonlySet<string> {
  try {
    return new Set((localStorage.getItem(key) ?? '').split('|').filter(Boolean))
  } catch {
    return new Set() // geen opslag: melding gewoon tonen
  }
}

/**
 * Weggeklikte melding per apparaat onthouden, met de ids waar hij over ging (bv. niet-gekoppelde kaarten).
 * Komt er een nieuw id bij, dan hoort de melding weer te verschijnen; zie `hasNew`.
 */
export function useDismissedIds(key: string): { hasNew: (ids: readonly string[]) => boolean; dismiss: (ids: readonly string[]) => void } {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => read(key))
  const hasNew = useCallback((ids: readonly string[]) => ids.some((id) => !dismissed.has(id)), [dismissed])
  const dismiss = useCallback(
    (ids: readonly string[]) => {
      const next = new Set(ids)
      setDismissed(next)
      try {
        localStorage.setItem(key, [...next].join('|'))
      } catch (err) {
        console.warn('Melding wegklikken onthouden mislukt', err)
      }
    },
    [key],
  )
  return { hasNew, dismiss }
}
