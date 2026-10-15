import type { CSSProperties, JSX } from 'react'
import type { Variant } from '../lib/types'

/** Vaste, per kaart verschillende vertraging (0–7 s), zodat niet alle kaarten tegelijk glanzen. */
function delayFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return `${(Math.abs(h) % 70) / 10}s`
}

/**
 * Subtiele glans over holo- en reverse-holokaarten. Alleen een transform-animatie op één laag
 * (geen herberekening van de pagina); uit bij "minder beweging".
 */
export function Foil({ variant, seed }: { variant: Variant | null; seed: string }): JSX.Element | null {
  if (variant !== 'holo' && variant !== 'reverse') return null
  return <span className={`foil foil-${variant}`} style={{ '--foil-delay': delayFor(seed) } as CSSProperties} aria-hidden="true" />
}
