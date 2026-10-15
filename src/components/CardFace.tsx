import type { JSX } from 'react'
import type { ItemKind } from '../lib/types'
import { LogoMark } from './Icons'

interface Props {
  name: string
  /** Bv. "CBB4C #23". */
  detail?: string | null
  kind?: ItemKind
  loading?: boolean
}

/** Getekende kaartvoorkant als er (nog) geen foto is: nooit een kale "No image". */
export function CardFace({ name, detail, kind = 'card', loading = false }: Props): JSX.Element {
  return (
    <div className={`card-img card-face ${kind}${loading ? ' loading' : ''}`} role="img" aria-label={[name, detail].filter(Boolean).join(', ')}>
      {!loading && (
        <>
          <LogoMark size={22} />
          <span className="card-face-name">{name}</span>
          {kind === 'sealed' ? <span className="card-face-detail">Sealed product</span> : detail && <span className="card-face-detail">{detail}</span>}
        </>
      )}
    </div>
  )
}
