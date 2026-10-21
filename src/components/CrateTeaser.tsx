import { useEffect, useState, type JSX } from 'react'
import { getCrateStatus } from '../lib/crate'
import { IconCrate } from './Icons'

/**
 * Crate-tegel op Overview (21-10-2026, keuze gebruiker: het spel moet opvallen): je punten en of het gratis pakje
 * van vandaag klaarstaat, met een knop naar de Crate. Niets zonder Crate (STAP11) of als de stand niet laadt.
 */
export function CrateTeaser(): JSX.Element | null {
  const [status, setStatus] = useState<{ points: number; freePack: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    getCrateStatus()
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch((err: unknown) => console.warn('Crate-stand ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])

  if (!status) return null
  return (
    <a className="crate-teaser" href="#/crate">
      <span className="crate-teaser-coin" aria-hidden="true">
        <IconCrate size={24} />
      </span>
      <span className="crate-teaser-text">
        <strong>{status.freePack ? 'Your free pack is ready!' : 'Crate'}</strong>
        <span className="small">{status.points.toLocaleString('en-GB')} Crate points · open packs and complete sets</span>
      </span>
      <span className="crate-teaser-go">{status.freePack ? 'Open it' : 'Play'}</span>
    </a>
  )
}
