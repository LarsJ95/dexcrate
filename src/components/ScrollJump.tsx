import { useEffect, useState, type JSX } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { motionAllowed } from '../lib/motion'
import { IconArrowDown, IconArrowUp } from './Icons'

/** Telefoon en tablet: dan staat de onderbalk er (zelfde breekpunt als in de CSS). */
const TOUCH_LAYOUT = '(max-width: 1023px)'
/** Pas pijlen als de pagina minstens zoveel schermen lang is. */
const MIN_SCREENS = 2
/** Zo dicht bij boven- of onderkant verdwijnt de pijl die die kant op wijst. */
const EDGE = 200
/** Telefoon: zo lang na het scrollen blijven de pijlen staan. */
const AWAKE_MS = 2000
const GAP = 12

interface Place {
  long: boolean
  atTop: boolean
  atBottom: boolean
  /** Afstand tot de onderkant: boven de onderbalk, Add card-knop en selectiebalk. */
  bottom: number
}

/** Hoogste bovenrand van wat vast onderin staat (onderbalk, zwevende hoofdknop, selectiebalk). */
function bottomOffset(base: number): number {
  const h = window.innerHeight
  let top = h
  for (const el of document.querySelectorAll<HTMLElement>('.tab-bar, button.fab, .select-bar')) {
    const r = el.getBoundingClientRect()
    const pos = getComputedStyle(el).position
    // Alleen wat echt onderin vastzit (fixed of sticky en in de onderste strook van het scherm).
    if (r.height === 0 || (pos !== 'fixed' && pos !== 'sticky') || r.bottom < h - 240 || r.top >= h) continue
    top = Math.min(top, r.top)
  }
  return Math.max(base, h - top + GAP)
}

function measure(base: number): Place {
  const doc = document.documentElement
  const y = window.scrollY
  const h = window.innerHeight
  return {
    long: doc.scrollHeight > h * MIN_SCREENS,
    atTop: y < EDGE,
    atBottom: y + h >= doc.scrollHeight - EDGE,
    bottom: bottomOffset(base),
  }
}

const same = (a: Place, b: Place): boolean => a.long === b.long && a.atTop === b.atTop && a.atBottom === b.atBottom && a.bottom === b.bottom

/**
 * Pijlen rechtsonder om snel naar boven of beneden te gaan (21-10-2026, op verzoek). Alleen op lange pagina's.
 * Computer: altijd zichtbaar. Telefoon: alleen tijdens en kort na het scrollen, boven de onderbalk en wat daar zweeft.
 */
export function ScrollJump(): JSX.Element | null {
  const touch = useMediaQuery(TOUCH_LAYOUT)
  const base = touch ? 0 : 20
  const [place, setPlace] = useState<Place>({ long: false, atTop: true, atBottom: false, bottom: base })
  const [awake, setAwake] = useState(false)

  useEffect(() => {
    let frame = 0
    let sleep = 0
    const update = (): void => {
      frame = 0
      const next = measure(base)
      setPlace((cur) => (same(cur, next) ? cur : next))
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onScroll = (): void => {
      schedule()
      if (!touch) return
      setAwake(true)
      window.clearTimeout(sleep)
      sleep = window.setTimeout(() => setAwake(false), AWAKE_MS)
    }
    schedule()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('hashchange', schedule)
    // Pagina wordt langer of korter (kaarten en foto's laden, filter): opnieuw meten.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    ro?.observe(document.body)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(sleep)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('hashchange', schedule)
      ro?.disconnect()
    }
  }, [touch, base])

  if (!place.long) return null
  const jump = (top: number): void => window.scrollTo({ top, behavior: motionAllowed() ? 'smooth' : 'auto' })
  return (
    <div className={`scroll-jump${touch ? ' is-touch' : ''}${!touch || awake ? ' is-shown' : ''}`} style={{ bottom: `${place.bottom}px` }}>
      {!place.atTop && (
        <button type="button" onClick={() => jump(0)} aria-label="Scroll to top" title="Scroll to top">
          <IconArrowUp size={20} />
        </button>
      )}
      {!place.atBottom && (
        <button type="button" onClick={() => jump(document.documentElement.scrollHeight)} aria-label="Scroll to bottom" title="Scroll to bottom">
          <IconArrowDown size={20} />
        </button>
      )}
    </div>
  )
}
