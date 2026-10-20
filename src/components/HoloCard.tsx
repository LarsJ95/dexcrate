import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import type { FoilStyle } from '../lib/cardTraits'
import { REST_POSE, settled } from '../lib/holoMotion'
import { useMotion } from '../lib/motion'

interface Props {
  foil: FoilStyle
  children: ReactNode
  /**
   * Volledige bediening (vergrote kaart): kantelen met de vinger (blokkeert scrollen).
   * Anders alleen met de muis en een rustige beweging. Nooit via de stand van de telefoon.
   */
  interactive?: boolean
  className?: string
}

const MAX_TILT = 16 // graden (DESIGN.md §9)
const DRAG_PX = 8 // meer beweging dan dit is slepen, geen tik

/**
 * Kaart die meekantelt met vinger of muis, met een glans per zeldzaamheid (DESIGN.md §9).
 * Werkt via CSS-variabelen op één element; zonder animaties staat de kaart stil met een vaste glans.
 */
export function HoloCard({ foil, children, interactive = false, className }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || !motion) return
    // Touchscreen (20-10-2026): geen rustige zwaai in rust. Elk beeldje opnieuw tekenen van de glanslagen gaf in Chrome
    // op Android zwart flikkeren bij de vergrote kaart; nu beweegt hij alleen onder je vinger en komt dan tot stilstand.
    const sway = typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches
    let frame = 0
    let active = false
    let moved = 0
    let start: [number, number] | null = null
    const cur = { rx: 0, ry: 0, mx: 50, my: 50 }
    // Volle glans alleen tijdens kantelen in de vergrote kaart; stilstaand is hij zacht (CSS: .is-tilting).
    const setActive = (v: boolean): void => {
      active = v
      el.classList.toggle('is-tilting', v && interactive)
    }
    const target = { ...cur }

    const aim = (px: number, py: number): void => {
      target.ry = (px - 0.5) * 2 * MAX_TILT
      target.rx = -(py - 0.5) * 2 * MAX_TILT
      target.mx = px * 100
      target.my = py * 100
    }
    const fromPointer = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      aim(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
    }

    const tick = (t: number): void => {
      if (!active && sway) aim(0.5 + Math.sin(t / 1500) * 0.22, 0.5 + Math.sin(t / 2300) * 0.18) // rustige beweging in rust
      if (!active && !sway) Object.assign(target, REST_POSE)
      const k = active ? 0.22 : 0.06
      cur.rx += (target.rx - cur.rx) * k
      cur.ry += (target.ry - cur.ry) * k
      cur.mx += (target.mx - cur.mx) * k
      cur.my += (target.my - cur.my) * k
      el.style.setProperty('--rx', `${cur.rx.toFixed(2)}deg`)
      el.style.setProperty('--ry', `${cur.ry.toFixed(2)}deg`)
      el.style.setProperty('--mx', `${cur.mx.toFixed(1)}%`)
      el.style.setProperty('--my', `${cur.my.toFixed(1)}%`)
      el.style.setProperty('--hyp', (Math.hypot(cur.mx - 50, cur.my - 50) / 70).toFixed(3))
      // Zonder zwaai: stoppen zodra de kaart weer stil ligt; een nieuwe aanraking start hem opnieuw.
      frame = !sway && !active && settled(cur, target) ? 0 : requestAnimationFrame(tick)
    }
    const run = (): void => {
      if (frame === 0) frame = requestAnimationFrame(tick)
    }
    if (sway) run()

    const onDown = (e: PointerEvent): void => {
      if (!interactive && e.pointerType !== 'mouse') return
      setActive(true)
      run()
      moved = 0
      start = [e.clientX, e.clientY]
      if (interactive) el.setPointerCapture(e.pointerId)
      fromPointer(e)
    }
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && !active) {
        setActive(true)
        run()
      }
      if (!active) return
      if (start) moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]))
      fromPointer(e)
    }
    const onUp = (): void => {
      setActive(false)
      start = null
      run() // terug naar de rustpositie (en daar stoppen)
    }
    // Na slepen geen tik doorgeven (de vergrote kaart sluit bij een tik).
    const onClick = (e: MouseEvent): void => {
      if (moved > DRAG_PX) {
        e.stopPropagation()
        e.preventDefault()
      }
      moved = 0
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onUp)
    el.addEventListener('click', onClick, true)
    return () => {
      cancelAnimationFrame(frame)
      el.classList.remove('is-tilting')
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onUp)
      el.removeEventListener('click', onClick, true)
      for (const v of ['--rx', '--ry', '--mx', '--my', '--hyp']) el.style.removeProperty(v)
    }
  }, [motion, interactive])

  return (
    <div ref={ref} className={`holo-card${interactive && motion ? ' is-interactive' : ''}${className ? ` ${className}` : ''}`} data-foil={foil}>
      {children}
      {foil !== 'none' && <span className="holo-foil" aria-hidden="true" />}
      <span className="holo-glare" aria-hidden="true" />
    </div>
  )
}
