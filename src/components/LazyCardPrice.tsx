import { useEffect, useRef, useState, type JSX } from 'react'
import { useCardPrice } from '../hooks/useCardPrice'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'

interface Props {
  /** TCGdex-sleutel ("en/sv03.5-025"). */
  cardKey: string
  className: string
}

/**
 * Cardmarket-marktprijs (standaarduitvoering) onder een kaart in een raster.
 * Pas ophalen als de kaart (bijna) in beeld komt; prijzen worden 6 uur gecachet.
 */
export function LazyCardPrice({ cardKey, className }: Props): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  // Zonder IntersectionObserver (oude browser) meteen laden.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const price = useCardPrice(seen ? cardKey : null)
  const mv = marketValue(price ?? null, null)
  return (
    <span ref={ref} className={className}>
      {!seen || price === undefined ? '…' : mv ? formatEur(mv.value) : '–'}
    </span>
  )
}
