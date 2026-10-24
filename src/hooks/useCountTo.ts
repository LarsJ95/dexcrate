import { useEffect, useRef, useState } from 'react'
import { useMotion } from '../lib/motion'

/**
 * Getal dat bij elke wijziging in `ms` naar de nieuwe waarde loopt (Pack points, 24-10-2026: "punten die zichtbaar
 * optellen"). Het eerste getal en alles zonder animaties: direct de echte waarde. Hele getallen.
 */
export function useCountTo(value: number | null, ms = 700): number | null {
  const motion = useMotion()
  const [shown, setShown] = useState(value)
  // Laatst getoonde waarde: een nieuwe wijziging halverwege loopt vanaf daar verder.
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (value === null || start === null || !motion || start === value) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / ms)
      const v = p >= 1 ? value : Math.round(start + (value - start) * (1 - (1 - p) ** 3))
      from.current = v
      setShown(v)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, motion, ms])

  return shown
}

/** Hoe lang "+40" of "−150" naast je punten blijft staan (ms). */
const DELTA_MS = 1800

/**
 * Verschil na een wijziging (inruilen +, pakje kopen −), even zichtbaar; niet bij het eerste getal. `key` telt op,
 * zodat dezelfde wijziging twee keer achter elkaar opnieuw verschijnt.
 */
export function useDelta(value: number | null): { n: number; key: number } | null {
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null)
  const prev = useRef(value)

  useEffect(() => {
    const before = prev.current
    prev.current = value
    if (before === null || value === null || before === value) return
    setDelta((d) => ({ n: value - before, key: (d?.key ?? 0) + 1 }))
    const t = window.setTimeout(() => setDelta(null), DELTA_MS)
    return () => clearTimeout(t)
  }, [value])

  return delta
}
