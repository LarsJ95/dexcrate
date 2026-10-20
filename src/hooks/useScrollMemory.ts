import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Scrollpositie van een lange lijst onthouden (gebruiker 20-10-2026: na terug uit een set begon Collection weer
 * bovenaan). Bij verlaten bewaard per pagina in sessionStorage, samen met hoeveel items er geladen waren; bij
 * terugkomen eerst evenveel tonen en dan terugscrollen, zoals tabbladen in een app. Na 30 minuten vergeten.
 */

const PREFIX = 'dexcrate:scroll:'
const MAX_AGE_MS = 30 * 60 * 1000

export interface ScrollMemory {
  y: number
  /** Aantal getoonde items (zie useLoadMore); 0 als de pagina niet in stukken laadt. */
  count: number
  at: number
}

export function readScrollMemory(key: string, now = Date.now()): ScrollMemory | null {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(PREFIX + key) ?? 'null')
    if (typeof v !== 'object' || v === null) return null
    const { y, count, at } = v as Partial<ScrollMemory>
    if (typeof y !== 'number' || typeof count !== 'number' || typeof at !== 'number') return null
    if (now - at > MAX_AGE_MS || y < 0) return null
    return { y, count, at }
  } catch {
    return null // geen opslag of onleesbaar: gewoon bovenaan beginnen
  }
}

export function writeScrollMemory(key: string, m: ScrollMemory): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(m))
  } catch (err) {
    console.warn('Scrollpositie onthouden mislukt', err)
  }
}

/** Wat de vorige keer voor deze pagina bewaard is; één keer gelezen bij het openen van de pagina. */
export function useSavedScroll(key: string): ScrollMemory | null {
  return useState(() => readScrollMemory(key))[0]
}

/**
 * Bewaart bij verlaten de scrollpositie en `count`; zet `saved` (zie useSavedScroll) terug zodra `ready` (de lijst
 * staat er). Begin de lijst met `saved.count` items, dan valt de oude positie binnen de pagina.
 */
export function useScrollMemory(key: string, saved: ScrollMemory | null, ready: boolean, count: number): void {
  const y = useRef(0)
  const countRef = useRef(count)
  const done = useRef(saved === null)

  useEffect(() => {
    countRef.current = count
  })

  useEffect(() => {
    const onScroll = (): void => {
      y.current = window.scrollY
    }
    const save = (): void => writeScrollMemory(key, { y: y.current, count: countRef.current, at: Date.now() })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', save)
    }
  }, [key])

  // Bij verlaten: als layout-effect, dus vóór de lijst uit de pagina gaat. Daarna zakt de pagina in en meldt de
  // browser scroll 0 nog vóór gewone effecten opruimen (gemeten 20-10-2026: zo werd 0 bewaard).
  useLayoutEffect(() => {
    return () => writeScrollMemory(key, { y: window.scrollY, count: countRef.current, at: Date.now() })
  }, [key])

  useEffect(() => {
    if (!ready || done.current || !saved) return
    // Na de andere effecten (App zet een nieuwe pagina eerst bovenaan) en nadat de lijst getekend is.
    const frame = requestAnimationFrame(() => {
      done.current = true
      window.scrollTo({ top: saved.y })
      y.current = window.scrollY
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, saved])
}
