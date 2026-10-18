import { useSyncExternalStore } from 'react'

/**
 * Instellingen per apparaat (localStorage), met live bijwerken: wie usePrefs gebruikt, ziet een wijziging meteen.
 * Instellingen in je account (waardeschatting, standaardwaarden) staan in Supabase, zie valuationDb.ts.
 */

export type ThemeChoice = 'dark' | 'light' | 'system'
export type ScanModePref = 'queue' | 'single' | 'multi'

export interface DevicePrefs {
  theme: ThemeChoice
  /** Levende achtergrond (sterren, vliegende Pokémon …). */
  sky: boolean
  /** Vaag behang van energiesymbolen. */
  wallpaper: boolean
  scanMode: ScanModePref
  /** Quick scan: automatisch afdrukken standaard aan. */
  autoCapture: boolean
  /** Duidelijk wazige camerafoto's tegenhouden. */
  blurCheck: boolean
  /** Minimale tijd tussen twee automatische foto's, in ms. */
  autoGapMs: AutoGap
}

export const AUTO_GAPS = [1500, 2500, 4000] as const
export type AutoGap = (typeof AUTO_GAPS)[number]

const KEYS: Record<keyof DevicePrefs, string> = {
  theme: 'dexcrate:theme',
  sky: 'dexcrate:sky',
  wallpaper: 'dexcrate:wallpaper',
  scanMode: 'dexcrate:scan-mode',
  autoCapture: 'dexcrate:auto-capture',
  blurCheck: 'dexcrate:blur-check',
  autoGapMs: 'dexcrate:auto-gap',
}
/** Thema-sleutels van vóór de naamswijzigingen; gelden tot er opnieuw gekozen wordt. */
const OLD_THEME_KEYS = ['binderline:theme', 'kaartenmap:theme'] as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // geen opslag: standaardwaarde
  }
}

function load(): DevicePrefs {
  const theme = [KEYS.theme, ...OLD_THEME_KEYS].map(read).find((v) => v !== null)
  const mode = read(KEYS.scanMode)
  const gap = Number(read(KEYS.autoGapMs))
  return {
    theme: theme === 'light' || theme === 'system' ? theme : 'dark',
    sky: read(KEYS.sky) !== 'off',
    wallpaper: read(KEYS.wallpaper) !== 'off',
    scanMode: mode === 'single' || mode === 'multi' ? mode : 'queue',
    autoCapture: read(KEYS.autoCapture) === '1',
    blurCheck: read(KEYS.blurCheck) !== 'off',
    autoGapMs: (AUTO_GAPS as readonly number[]).includes(gap) ? (gap as AutoGap) : 2500,
  }
}

let prefs = load()
const listeners = new Set<() => void>()

function encode<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (key === 'autoCapture') return value ? '1' : '0'
  return value ? 'on' : 'off'
}

export function setPref<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]): void {
  prefs = { ...prefs, [key]: value }
  try {
    localStorage.setItem(KEYS[key], encode(key, value))
  } catch (err) {
    console.warn('Instelling bewaren mislukt', err)
  }
  for (const l of listeners) l()
}

export const getPrefs = (): DevicePrefs => prefs

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs)
}
