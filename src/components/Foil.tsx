import type { CSSProperties, JSX } from 'react'
import type { FoilStyle } from '../lib/cardTraits'

/** Vaste, per kaart verschillende vertraging (0–7 s), zodat niet alle kaarten tegelijk glanzen. */
function delayFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return `${(Math.abs(h) % 70) / 10}s`
}

/**
 * Subtiele glans over tegels met een holo-uitvoering of hogere zeldzaamheid (DESIGN.md §9).
 * Alleen een transform-animatie op één laag (geen herberekening van de pagina); uit zonder animaties.
 */
export function Foil({ foil, seed }: { foil: FoilStyle; seed: string }): JSX.Element | null {
  if (foil === 'none') return null
  return <span className={`foil foil-${foil}`} style={{ '--foil-delay': delayFor(seed) } as CSSProperties} aria-hidden="true" />
}
