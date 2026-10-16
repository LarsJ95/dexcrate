import { registerSW } from 'virtual:pwa-register'

/**
 * App-updates (PWA). Zoekt naar een nieuwe versie bij openen, bij terugkeren naar de app en elk uur.
 * Een nieuwe versie wordt pas geladen als dat veilig is: geen open venster en niet aan het typen,
 * zodat je nooit een half ingevuld formulier kwijtraakt.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000
const RETRY_MS = 15_000

function safeToReload(): boolean {
  if (document.querySelector('dialog[open]')) return false
  const a = document.activeElement
  return !(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement)
}

export function initAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return
  let waiting = false
  let timer: number | null = null

  const applyWhenSafe = (): void => {
    if (!waiting) return
    if (safeToReload()) {
      void updateSW(true)
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
      applyWhenSafe()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = (): void => {
        registration.update().catch((err: unknown) => console.warn('Zoeken naar een app-update mislukt', err))
      }
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
    onRegisterError(err: unknown) {
      console.warn('Service worker registreren mislukt', err)
    },
  })
}
