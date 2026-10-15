import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import type { FoilStyle } from '../lib/cardTraits'
import { useMotion } from '../lib/motion'

interface Props {
  foil: FoilStyle
  children: ReactNode
  /**
   * Volledige bediening (vergrote kaart): kantelen met de vinger blokkeert scrollen en
   * op Android ook met de stand van de telefoon. Anders alleen met de muis en een rustige beweging.
   */
  interactive?: boolean
  className?: string
}

const MAX_TILT = 16 // graden (DESIGN.md §9)
const DRAG_PX = 8 // meer beweging dan dit is slepen, geen tik

/**
 * Kaart die meekantelt met vinger, muis of telefoon, met een glans per zeldzaamheid (DESIGN.md §9).
 * Werkt via CSS-variabelen op één element; zonder animaties staat de kaart stil met een vaste glans.
 */
export function HoloCard({ foil, children, interactive = false, className }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || !motion) return
    let frame = 0
    let active = false
    let moved = 0
    let start: [number, number] | null = null
    let tilt: [number, number] | null = null // van de telefoonstand
    const cur = { rx: 0, ry: 0, mx: 50, my: 50 }
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
      if (!active) {
        if (tilt) aim(tilt[0], tilt[1])
        else aim(0.5 + Math.sin(t / 1500) * 0.22, 0.5 + Math.sin(t / 2300) * 0.18) // rustige beweging in rust
      }
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
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const onDown = (e: PointerEvent): void => {
      if (!interactive && e.pointerType !== 'mouse') return
      active = true
      moved = 0
      start = [e.clientX, e.clientY]
      if (interactive) el.setPointerCapture(e.pointerId)
      fromPointer(e)
    }
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse') active = true
      if (!active) return
      if (start) moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]))
      fromPointer(e)
    }
    const onUp = (): void => {
      active = false
      start = null
    }
    // Na slepen geen tik doorgeven (de vergrote kaart sluit bij een tik).
    const onClick = (e: MouseEvent): void => {
      if (moved > DRAG_PX) {
        e.stopPropagation()
        e.preventDefault()
      }
      moved = 0
    }
    // Android geeft de stand zonder toestemming; iOS vraagt toestemming en valt hier buiten.
    const onOrient = (e: DeviceOrientationEvent): void => {
      if (e.beta === null || e.gamma === null) return
      const px = 0.5 + Math.max(-1, Math.min(1, e.gamma / 30)) * 0.5
      const py = 0.5 + Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * 0.5
      tilt = [px, py]
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onUp)
    el.addEventListener('click', onClick, true)
    if (interactive) window.addEventListener('deviceorientation', onOrient)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onUp)
      el.removeEventListener('click', onClick, true)
      window.removeEventListener('deviceorientation', onOrient)
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
