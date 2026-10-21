import { useEffect, useState } from 'react'
import { isAdmin } from '../lib/admin'

/**
 * Of je beheerder bent (STAP21); undefined zolang dat gecontroleerd wordt. Bewust niet onthouden op het apparaat
 * (anders dan useDbFeature): een ander account kan hier inloggen.
 */
export function useIsAdmin(): boolean | undefined {
  const [admin, setAdmin] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    isAdmin()
      .then((v) => {
        if (!cancelled) setAdmin(v)
      })
      .catch((err: unknown) => {
        console.warn('Beheerder controleren mislukt', err)
        if (!cancelled) setAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return admin
}
