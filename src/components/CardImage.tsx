import { useMemo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { imageCandidates } from '../lib/tcgdex'
import type { ItemKind } from '../lib/types'
import { CardPicture } from './CardPicture'

interface Props {
  tcgdexId: string | null
  kind: ItemKind
  name: string
  /** Eigen foto (heeft voorrang op de officiële afbeelding). */
  photoPath?: string | null
  quality?: 'low' | 'high'
}

/** Kaartfoto: eigen foto, anders officiële bronnen met terugval; nette vervanging als er niets is. */
export function CardImage({ tcgdexId, kind, name, photoPath, quality = 'low' }: Props): JSX.Element {
  const info = useCardInfo(tcgdexId)
  const photo = usePhotoUrl(photoPath)
  const sources = useMemo(() => {
    const official = info ? imageCandidates(info.lang, info.set.id, info.localId, info.image, quality) : []
    return photo ? [photo, ...official] : official
  }, [info, photo, quality])

  const waiting = (photoPath && photo === undefined) || (info === undefined && tcgdexId)
  const label = kind === 'sealed' ? 'Sealed' : waiting ? 'Loading…' : tcgdexId ? 'No image' : 'No photo'
  const placeholder = (
    <div className={`card-img placeholder ${kind}`} role="img" aria-label={`${name}: ${label}`}>
      <span>{label}</span>
    </div>
  )
  return <CardPicture sources={sources} alt={name} fallback={placeholder} />
}
