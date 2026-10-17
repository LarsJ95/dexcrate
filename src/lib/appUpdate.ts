import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * App-updates (PWA). Zoekt naar een nieuwe versie bij openen, bij terugkeren naar de app, als je weer
 * online komt en elke 10 minuten zolang de app in beeld is. Een nieuwe versie wordt pas geladen als dat
 * veilig is: geen open venster en niet aan het typen, zodat je nooit een half ingevuld formulier kwijtraakt.
 * Je ziet een korte melding vóór en na het verversen.
 *
 * Let op: GitHub Pages bewaart bestanden tot 10 minuten in zijn cache; vlak na een deploy kan het
 * daarom tot ±10 minuten duren voordat een telefoon de nieuwe versie ziet.
 */

const CHECK_EVERY_MS = 10 * 60 * 1000
const RETRY_MS = 15_000
/** Zo lang staat "Updating…" in beeld voordat de app herlaadt. */
const NOTICE_MS = 900
/** Zo lang staat "Updated" in beeld na het herladen. */
const DONE_MS = 4000
const UPDATED_KEY = 'dexcrate:just-updated'

let registered: ServiceWorkerRegistration | null = null
/** Er staat een nieuwe versie klaar (wordt geladen zodra het veilig is). */
let pending = false

export type UpdateNotice = 'updating' | 'updated' | null
let notice: UpdateNotice = null
const listeners = new Set<() => void>()

function setNotice(next: UpdateNotice): void {
  notice = next
  for (const l of listeners) l()
}

/** Melding over een app-update voor in beeld (null = niets te melden). */
export function useUpdateNotice(): UpdateNotice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => notice,
  )
}

/**
 * Zelf zoeken naar een nieuwe versie (Settings). 'updating' = gevonden, de app herlaadt zo;
 * 'latest' = je hebt de nieuwste; 'unavailable' = geen service worker (bv. in de ontwikkelomgeving).
 */
export async function checkForUpdate(): Promise<'updating' | 'latest' | 'unavailable'> {
  if (!registered) return 'unavailable'
  await registered.update()
  return pending || registered.waiting || registered.installing ? 'updating' : 'latest'
}

function safeToReload(): boolean {
  if (document.querySelector('dialog[open]')) return false
  const a = document.activeElement
  return !(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement)
}

/** Na het verversen even laten zien dat de app is bijgewerkt. */
function showUpdatedOnce(): void {
  try {
    if (sessionStorage.getItem(UPDATED_KEY) !== '1') return
    sessionStorage.removeItem(UPDATED_KEY)
  } catch {
    return // geen opslag: dan ook geen melding
  }
  setNotice('updated')
  window.setTimeout(() => setNotice(null), DONE_MS)
}

export function initAppUpdates(): void {
  showUpdatedOnce()
  if (!('serviceWorker' in navigator)) return
  let waiting = false
  let timer: number | null = null

  const applyWhenSafe = (): void => {
    if (!waiting) return
    if (safeToReload()) {
      waiting = false
      setNotice('updating')
      try {
        sessionStorage.setItem(UPDATED_KEY, '1')
      } catch (err) {
        console.warn('Updatemelding onthouden mislukt', err)
      }
      window.setTimeout(() => void updateSW(true), NOTICE_MS)
      return
    }
    if (timer === null) {
      timer = window.setTimeout(() => {
        timer = null
        applyWhenSafe()
      }, RETRY_MS)
    }
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true
      pending = true
      applyWhenSafe()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      registered = registration
      const check = (): void => {
        if (!navigator.onLine || registration.installing) return
        registration.update().catch((err: unknown) => console.warn('Zoeken naar een app-update mislukt', err))
      }
      // Alleen zolang de app in beeld is; op de achtergrond niet (batterij).
      window.setInterval(() => {
        if (document.visibilityState === 'visible') check()
      }, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
    onRegisterError(err: unknown) {
      console.warn('Service worker registreren mislukt', err)
    },
  })
}
