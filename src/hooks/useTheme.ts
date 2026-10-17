import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { setPref, usePrefs } from '../lib/devicePrefs'

export type Theme = 'dark' | 'light'

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

function subscribeSystem(l: () => void): () => void {
  darkQuery?.addEventListener('change', l)
  return () => darkQuery?.removeEventListener('change', l)
}

const systemTheme = (): Theme => (darkQuery && !darkQuery.matches ? 'light' : 'dark')

/**
 * Thema: donker, licht of automatisch (volgt het systeem). Keuze per apparaat (Settings → Appearance).
 * `toggle` (knop in de kop) kiest het andere thema vast.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const { theme: choice } = usePrefs()
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => 'dark' as Theme)
  const theme: Theme = choice === 'system' ? system : choice

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e0d12' : '#dcdae1')
  }, [theme])

  const toggle = useCallback(() => setPref('theme', theme === 'dark' ? 'light' : 'dark'), [theme])
  return { theme, toggle }
}
