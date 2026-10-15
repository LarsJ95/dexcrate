import type { JSX } from 'react'

/** Laadmelding met een wiebelende pokébal (DESIGN.md §9). */
export function Loading({ center = false, text = 'Loading…' }: { center?: boolean; text?: string }): JSX.Element {
  return (
    <p className={`loading${center ? ' center' : ''}`} aria-live="polite">
      <span className="pokeball" aria-hidden="true" />
      {text}
    </p>
  )
}
