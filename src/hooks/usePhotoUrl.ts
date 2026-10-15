import { useEffect, useState } from 'react'
import { getPhotoUrl } from '../lib/photos'

/** undefined = laden of geen foto; anders de tijdelijke link. */
export function usePhotoUrl(path: string | null | undefined): string | null | undefined {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    getPhotoUrl(path)
      .then((url) => {
        if (!cancelled) setState({ path, url })
      })
      .catch((err: unknown) => {
        console.warn('Foto-link ophalen mislukt', err)
        if (!cancelled) setState({ path, url: null })
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!path) return null
  return state?.path === path ? state.url : undefined
}
