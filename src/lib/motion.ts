import { useSyncExternalStore } from 'react'

/** Animaties per apparaat aan/uit (DESIGN.md §9); "minder beweging" van het systeem gaat altijd voor. */
const KEY = 'dexcrate:motion'
const listeners = new Set<() => void>()
const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function readPreference(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true // Geen opslag beschikbaar: standaard aan.
  }
}

let preference = readPreference()

/** Wat de gebruiker in Settings koos, los van de systeeminstelling. */
export function motionPreference(): boolean {
  return preference
}

/** Mag er bewogen worden: instelling aan en geen "minder beweging". */
export function motionAllowed(): boolean {
  return preference && !reduced?.matches
}

function apply(): void {
  document.documentElement.dataset.motion = motionAllowed() ? 'on' : 'off'
  for (const l of listeners) l()
}

export function setMotionPreference(on: boolean): void {
  preference = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch (err) {
    console.warn('Animatie-instelling opslaan mislukt', err)
  }
  apply()
}

/** Eenmalig bij het starten: zet data-motion op <html> en volgt wijzigingen van het systeem. */
export function initMotion(): void {
  reduced?.addEventListener('change', apply)
  apply()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useMotion(): boolean {
  return useSyncExternalStore(subscribe, motionAllowed, () => false)
}

export function useMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, motionPreference, () => true)
}
