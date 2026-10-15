import { useMemo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { imageCandidates } from '../lib/tcgdex'
import type { ItemKind } from '../lib/types'
import { CardFace } from './CardFace'
import { CardPicture } from './CardPicture'

interface Props {
  tcgdexId: string | null
  kind: ItemKind
  name: string
  /** Eigen foto (heeft voorrang op de officiële afbeelding). */
  photoPath?: string | null
  /** Set en nummer voor de getekende voorkant als er geen foto is. */
  detail?: string | null
  quality?: 'low' | 'high'
}

/** Kaartfoto: eigen foto, anders officiële bronnen met terugval; nette vervanging als er niets is. */
export function CardImage({ tcgdexId, kind, name, photoPath, detail, quality = 'low' }: Props): JSX.Element {
  const info = useCardInfo(tcgdexId)
  const photo = usePhotoUrl(photoPath)
  const sources = useMemo(() => {
    const official = info ? imageCandidates(info.lang, info.set.id, info.localId, info.image, quality, info.tcgplayerId) : []
    return photo ? [photo, ...official] : official
  }, [info, photo, quality])

  const waiting = Boolean((photoPath && photo === undefined) || (info === undefined && tcgdexId))
  return (
    <CardPicture sources={sources} alt={name} fallback={<CardFace name={name} detail={detail} kind={kind} loading={waiting} />} />
  )
}
