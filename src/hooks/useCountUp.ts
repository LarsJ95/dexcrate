import { useEffect, useRef, useState } from 'react'
import { useMotion } from '../lib/motion'

/**
 * Getal dat bij het eerste tonen in `ms` optelt vanaf 0 (DESIGN.md §9, max. 800 ms).
 * Latere wijzigingen en zonder animaties: direct de echte waarde.
 */
export function useCountUp(value: number | null, ms = 800): number | null {
  const motion = useMotion()
  const [shown, setShown] = useState<number | null>(motion ? 0 : value)
  const counted = useRef(false)

  useEffect(() => {
    if (value === null || !motion || counted.current) {
      setShown(value)
      return
    }
    counted.current = true
    const start = performance.now()
    let frame = 0
    const step = (t: number): void => {
      const p = Math.min(1, (t - start) / ms)
      const eased = 1 - (1 - p) ** 3
      setShown(p >= 1 ? value : Math.round(value * eased * 100) / 100)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      // Afgebroken (bv. StrictMode of snelle wissel): toon meteen de echte waarde.
      setShown(value)
    }
  }, [value, motion, ms])

  return shown
}
