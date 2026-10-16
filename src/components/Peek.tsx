import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { burstFrom } from '../lib/fx'
import { motionAllowed, useMotion } from '../lib/motion'
import { SHINY_CHANCE, spriteUrls } from '../lib/runner'
import { busy, loadSprite, previewPeekDelay } from '../lib/sprites'

const PIKACHU = 25
/** Waar Pikachu achter kan zitten: kaarten en setregels. */
const TARGETS = '.tile, .slot, .catalog-hit, .set-row'
/** Hier mag hij niet overheen kijken (iets om op te tikken of in te typen). */
const KEEP_CLEAR = 'button, a, input, select, textarea, label, [role="group"], header, nav'
const NEXT_MIN = 3 * 60_000
const NEXT_SPREAD = 3 * 60_000
const RETRY = 30_000
/** Hoe lang hij kijkt, inclusief omhoog en weer weg (DESIGN.md §9: ≤ 1,5 s beweging, daarna even blijven). */
const PEEK_MS = 3200

interface PeekState {
  src: string
  shiny: boolean
  width: number
  height: number
  /** Zichtbaar deel boven de rand (kop en oren). */
  visible: number
  left: number
  top: number
}

/** Vrij boven de rand: geen knop, link of invoerveld waar hij overheen zou kijken. */
function isClear(left: number, top: number, width: number, height: number): boolean {
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.3, 0.8]) {
      const el = document.elementFromPoint(left + width * fx, top + height * fy)
      if (el?.closest(KEEP_CLEAR)) return false
    }
  }
  return true
}

/** Plek boven een kaart die helemaal in beeld is (niet onder de kop of de onderbalk) en vrij is. */
function pickSpot(width: number, visible: number): { left: number; top: number } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const rects = [...document.querySelectorAll(TARGETS)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width >= width && r.top >= 140 && r.bottom <= vh - 90 && r.left >= 8 && r.right <= vw - 8)
  for (let tries = 0; tries < 12 && rects.length > 0; tries++) {
    const r = rects[Math.floor(Math.random() * rects.length)]
    const left = Math.max(r.left, Math.min(r.left + r.width * (0.2 + Math.random() * 0.6) - width / 2, r.right - width))
    const top = r.top - visible + 2
    if (isClear(left, top, width, visible)) return { left, top }
  }
  return null
}

/** Af en toe kijkt Pikachu om de hoek van een kaart; tikken laat hem schrikken. */
export function Peek({ paused }: { paused: boolean }): JSX.Element | null {
  const motion = useMotion()
  const [peek, setPeek] = useState<PeekState | null>(null)
  const [say, setSay] = useState<string | null>(null)
  const [ducking, setDucking] = useState(false)
  const pausedRef = useRef(paused)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!motion) return
    let cancelled = false
    let timer: number | null = null
    const schedule = (ms: number): void => {
      timer = window.setTimeout(() => void attempt(), ms)
    }
    const attempt = async (): Promise<void> => {
      if (cancelled) return
      if (!motionAllowed() || pausedRef.current || busy()) return schedule(RETRY)
      const shiny = Math.random() < SHINY_CHANCE
      const sprite = await loadSprite(spriteUrls(PIKACHU, shiny))
      if (cancelled) return
      if (!sprite || busy()) return schedule(RETRY)
      const scale = sprite.animated ? 2 : 1
      const width = sprite.width * scale
      const height = sprite.height * scale
      // Kop en oren; de rest zit achter de kaart.
      const visible = Math.round(height * 0.55)
      const spot = pickSpot(width, visible)
      if (!spot) return schedule(RETRY)
      setDucking(false)
      setSay(null)
      setPeek({ src: sprite.src, shiny, width, height, visible, ...spot })
    }
    schedule(previewPeekDelay() ?? 60_000 + Math.random() * 60_000)
    const onDone = (): void => schedule(NEXT_MIN + Math.random() * NEXT_SPREAD)
    window.addEventListener('dexcrate:peek-done', onDone)
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
      window.removeEventListener('dexcrate:peek-done', onDone)
    }
  }, [motion])

  // Scrollen of van pagina wisselen: meteen weg (hij hoort bij die ene kaart).
  useEffect(() => {
    if (!peek) return
    const hide = (): void => {
      setPeek(null)
      window.dispatchEvent(new Event('dexcrate:peek-done'))
    }
    window.addEventListener('scroll', hide, { capture: true, passive: true, once: true })
    window.addEventListener('hashchange', hide, { once: true })
    return () => {
      window.removeEventListener('scroll', hide, { capture: true })
      window.removeEventListener('hashchange', hide)
    }
  }, [peek])

  if (!motion || !peek) return null

  const style = {
    left: `${peek.left}px`,
    top: `${peek.top}px`,
    width: `${peek.width}px`,
    height: `${peek.visible}px`,
    '--peek-h': `${peek.visible}px`,
    '--peek-ms': `${PEEK_MS}ms`,
  } as CSSProperties

  return createPortal(
    <div className="peek" style={style}>
      {say && <span className="peek-bubble">{say}</span>}
      <button
        ref={ref}
        type="button"
        className={`peek-pikachu${ducking ? ' is-duck' : ''}`}
        tabIndex={-1}
        aria-hidden="true"
        onAnimationEnd={(e) => {
          if (e.animationName !== 'peek-up' && e.animationName !== 'peek-duck') return
          setPeek(null)
          window.dispatchEvent(new Event('dexcrate:peek-done'))
        }}
        onClick={() => {
          if (ducking) return
          setSay(peek.shiny ? 'Shiny Pikachu!' : 'Pika!')
          setDucking(true)
          if (ref.current) burstFrom(ref.current, { colors: peek.shiny ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : ['var(--yellow)', '#ffffff'], count: 16, speed: 5, gravity: 0.1 })
        }}
      >
        <img src={peek.src} alt="" width={peek.width} height={peek.height} draggable={false} />
      </button>
    </div>,
    document.body,
  )
}
