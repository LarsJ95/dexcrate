import { useEffect, useRef } from 'react'

/**
 * Terugknop (Android, browser) sluit de bovenste popup in plaats van niets te doen of de pagina te verlaten.
 * Elke open popup heeft een eigen stap in de geschiedenis (zelfde adres, dus geen hashchange).
 * Invariant: aantal eigen stappen boven de pagina = aantal open popups (`open.length`).
 * Volgorde = volgorde van openen. Een popup die in dezelfde render als zijn ouder opent, komt er (React-effectvolgorde)
 * ónder te staan; dat doet de app niet (een binnenste popup opent altijd na een tik).
 */
const open: { close: () => void }[] = []
/** Eigen stappen die nog uit de geschiedenis moeten (popup gesloten met ✕, Escape of naast tikken). */
let pendingBack = 0
let flushQueued = false
/** popstate-events die we zelf veroorzaken met history.go en dus moeten negeren. */
let ownPops = 0
/** Eén vaste listener voor de hele app (blijft staan, zodat ook late eigen popstates worden opgevangen). */
let listening = false
const MARK = 'dexcratePopup'

function isOwnStep(state: unknown): boolean {
  return typeof state === 'object' && state !== null && MARK in state
}

function onPopState(): void {
  if (ownPops > 0) {
    ownPops--
    return
  }
  // De gebruiker drukte op terug: die stap is al weg, dus alleen de bovenste popup sluiten.
  open.pop()?.close()
}

// Opruimen in één keer na alle cleanups (geneste popups die samen sluiten), met één history.go.
function flush(): void {
  flushQueued = false
  const steps = pendingBack
  pendingBack = 0
  // Via een link weggenavigeerd: dan staan we niet meer op een eigen stap en laten we de geschiedenis met rust.
  if (steps === 0 || !isOwnStep(window.history.state)) return
  ownPops++
  window.history.go(-steps)
}

export function useBackToClose(close: () => void): void {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    const entry = { close: () => latest.current() }
    if (!listening) {
      listening = true
      window.addEventListener('popstate', onPopState)
    }
    open.push(entry)
    window.history.pushState({ [MARK]: open.length }, '')
    return () => {
      const i = open.indexOf(entry)
      // Al gesloten via de terugknop: die stap is al weg.
      if (i < 0) return
      open.splice(i, 1)
      pendingBack++
      if (!flushQueued) {
        flushQueued = true
        queueMicrotask(flush)
      }
    }
  }, [])
}
