import { useEffect } from 'react'

/**
 * Scherm aan houden zolang `active` (bv. tijdens snel scannen), zodat herkennen niet pauzeert.
 * De browser laat het slot los als de app naar de achtergrond gaat; bij terugkomen vragen we het opnieuw.
 * Zonder ondersteuning (oude browser) gebeurt er niets.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = (): void => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release()
          else lock = l
        })
        .catch((err: unknown) => console.warn('Scherm aan houden lukt niet', err))
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      if (lock && !lock.released) lock.release().catch((err: unknown) => console.warn('Scherm-slot loslaten mislukt', err))
    }
  }, [active])
}
