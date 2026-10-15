import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'dexcrate:theme'
/** Sleutels van vóór de naamswijzigingen; gelden tot er opnieuw gekozen wordt. */
const OLD_KEYS = ['binderline:theme', 'kaartenmap:theme'] as const

function readTheme(): Theme {
  try {
    const saved = [STORAGE_KEY, ...OLD_KEYS].map((k) => localStorage.getItem(k)).find((v) => v !== null)
    return saved === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark' // geen opslag: standaard donker
  }
}

/** Donker is de basis; de keuze wordt per apparaat onthouden. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1226' : '#f2f5fb')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (err) {
      console.warn('Thema onthouden mislukt', err)
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
