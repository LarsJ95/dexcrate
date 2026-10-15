import type { JSX } from 'react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { PHOTO_LABELS, type CardPhoto } from '../lib/types'

/** Kleine versie van een eigen foto (lijsten, inbox). */
export function PhotoThumb({ photo }: { photo: CardPhoto }): JSX.Element {
  const url = usePhotoUrl(photo.thumb_path ?? photo.path)
  return url ? <img src={url} alt="" loading="lazy" /> : <span className="photo-thumb-empty" />
}

/** Weergaveversie van een eigen foto, voor de vergrote weergave. */
export function PhotoLarge({ photo }: { photo: CardPhoto }): JSX.Element {
  const url = usePhotoUrl(photo.path)
  return url ? <img className="photo-zoom" src={url} alt={PHOTO_LABELS[photo.label]} /> : <span className="photo-thumb-empty" />
}
