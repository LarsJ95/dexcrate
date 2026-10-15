import { useState, type JSX, type ReactNode } from 'react'

interface Props {
  /** Bronnen in volgorde van voorkeur; bij een laadfout wordt de volgende geprobeerd. */
  sources: readonly string[]
  alt: string
  className?: string
  /** Wat er staat als geen enkele bron werkt. */
  fallback: ReactNode
}

/** Kaartfoto met terugvalketen (bv. TCGdex → Limitless). */
export function CardPicture({ sources, alt, className = 'card-img', fallback }: Props): JSX.Element {
  // Bijhouden welke bronnen voor déze lijst al faalden, zodat een nieuwe lijst opnieuw begint.
  const listKey = sources.join('|')
  const [failed, setFailed] = useState<{ key: string; count: number }>({ key: listKey, count: 0 })
  const count = failed.key === listKey ? failed.count : 0
  const src = sources[count]

  if (!src) return <>{fallback}</>
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed({ key: listKey, count: count + 1 })}
    />
  )
}
