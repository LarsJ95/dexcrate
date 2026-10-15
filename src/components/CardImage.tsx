import { useMemo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { imageCandidates } from '../lib/tcgdex'
import type { ItemKind } from '../lib/types'
import { CardPicture } from './CardPicture'

interface Props {
  tcgdexId: string | null
  kind: ItemKind
  name: string
  quality?: 'low' | 'high'
}

/** Kaartfoto met terugvalbronnen en nette vervanging voor sealed, niet-gekoppeld en ontbrekende plaatjes. */
export function CardImage({ tcgdexId, kind, name, quality = 'low' }: Props): JSX.Element {
  const info = useCardInfo(tcgdexId)
  const sources = useMemo(
    () => (info ? imageCandidates(info.lang, info.set.id, info.localId, info.image, quality) : []),
    [info, quality],
  )

  const label = kind === 'sealed' ? 'Sealed' : info === undefined && tcgdexId ? 'Loading…' : tcgdexId ? 'No image' : 'Not linked'
  const placeholder = (
    <div className={`card-img placeholder ${kind}`} role="img" aria-label={`${name}: ${label}`}>
      <span>{label}</span>
    </div>
  )
  return <CardPicture sources={sources} alt={name} fallback={placeholder} />
}
