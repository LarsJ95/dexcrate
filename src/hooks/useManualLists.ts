import { useEffect, useState } from 'react'
import { hasManualLists, listWishlistLists } from '../lib/wishlistLists'
import { useDbFeature } from './useDbFeature'

/**
 * Je eigen wishlist-lijsten (STAP17) om een wens in te zetten, alleen als `enabled`.
 * Leeg zolang ze laden, zonder STAP17 of als ophalen mislukt (dan geen lijstkeuze).
 */
export function useManualLists(enabled: boolean): { id: string; name: string }[] {
  const manual = useDbFeature(hasManualLists, 'wishlist-manual-lists')
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  const on = enabled && manual === true

  useEffect(() => {
    if (!on) return
    let cancelled = false
    listWishlistLists()
      .then((all) => {
        if (!cancelled) setLists(all.filter((l) => l.kind === 'manual').map((l) => ({ id: l.id, name: l.name })))
      })
      .catch((err: unknown) => console.warn('Eigen lijsten ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [on])

  return on ? lists : []
}
