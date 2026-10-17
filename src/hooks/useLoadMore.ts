import { useEffect, useRef, useState, type RefObject } from 'react'

/** Zoveel pixels vóór het einde van de lijst al de volgende reeks tonen. */
const LOAD_AHEAD = '800px'

/**
 * Lange lijsten in stukken tonen: eerst `page` items, en meer zodra het einde in beeld komt.
 * Een andere `resetKey` (bv. andere zoekterm of sortering) begint weer bij het begin.
 */
export function useLoadMore(total: number, resetKey: string, page: number): { count: number; sentinel: RefObject<HTMLDivElement | null> } {
  const [shown, setShown] = useState({ key: resetKey, count: page })
  const count = shown.key === resetKey ? shown.count : page
  const sentinel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || total <= count) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown({ key: resetKey, count: count + page })
      },
      { rootMargin: LOAD_AHEAD },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [resetKey, count, total, page])

  return { count: Math.min(count, total), sentinel }
}
