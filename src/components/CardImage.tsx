import { useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { imageUrl } from '../lib/tcgdex'
import type { ItemKind } from '../lib/types'

interface Props {
  tcgdexId: string | null
  kind: ItemKind
  name: string
  quality?: 'low' | 'high'
}

/** Kaartfoto met nette vervanging voor sealed, niet-gekoppeld en ontbrekende plaatjes. */
export function CardImage({ tcgdexId, kind, name, quality = 'low' }: Props): JSX.Element {
  const info = useCardInfo(tcgdexId)
  const [failed, setFailed] = useState<string | null>(null)
  const src = imageUrl(info?.image ?? null, quality)

  if (src && failed !== src) {
    return <img className="card-img" src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(src)} />
  }
  const label = kind === 'sealed' ? 'Sealed' : info === undefined && tcgdexId ? 'Laden…' : tcgdexId ? 'Geen foto' : 'Niet gekoppeld'
  return (
    <div className={`card-img placeholder ${kind}`} role="img" aria-label={`${name}: ${label}`}>
      <span>{label}</span>
    </div>
  )
}
