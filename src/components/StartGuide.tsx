import { useEffect, type JSX, type ReactNode } from 'react'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { STARTERS, setPartnerChoice, usePartnerChoice } from '../lib/partner'
import { spriteUrls } from '../lib/runner'
import { IconCamera, IconCheck } from './Icons'

const KEY = 'dexcrate:start-guide'
const STATES = ['new', 'open', 'done'] as const
/** Snelkeuze op de startkaart; de rest staat in Settings. */
const QUICK_STARTERS = STARTERS.slice(0, 5)

interface Props {
  /** Er staat al minstens één kaart in je collectie. */
  hasCards: boolean
  /** Wat er staat als de startkaart weg is (bv. de lege pagina). */
  fallback?: ReactNode
}

/**
 * Startkaart op Home voor nieuwe gebruikers (24-10-2026, keuze gebruiker): partner kiezen, eerste kaart scannen of je lijst
 * importeren, met vinkjes. Alleen op een toestel dat Home voor het eerst met een lege collectie zag (bestaande
 * gebruikers krijgen hem niet); blijft tot alles af is en je hem sluit, of tot je hem wegklikt.
 */
export function StartGuide({ hasCards, fallback = null }: Props): JSX.Element {
  const [state, setState] = useStoredChoice(KEY, STATES, 'new')
  const partner = usePartnerChoice()
  const shown = state === 'open' || (state === 'new' && !hasCards)

  useEffect(() => {
    if (state === 'new' && !hasCards) setState('open')
  }, [state, hasCards, setState])

  if (!shown) return <>{fallback}</>
  const allDone = hasCards && partner !== null

  return (
    <div className="panel start-guide" role="region" aria-labelledby="start-guide-title">
      <div className="start-guide-head">
        <h2 className="panel-title" id="start-guide-title">
          {allDone ? 'You’re all set!' : 'Get started'}
        </h2>
        <button type="button" className="start-guide-close" aria-label="Hide getting started" onClick={() => setState('done')}>
          ×
        </button>
      </div>
      <p className="flavor">{allDone ? 'Your adventure begins!' : 'Three quick steps to begin your adventure.'}</p>
      <ol className="start-guide-steps">
        <li className={partner ? 'is-done' : undefined}>
          <StepMark done={partner !== null} n={1} />
          <div>
            <strong>Pick your partner</strong>
            <span className="muted small">{partner ? `${partner.name} walks along with you through the app.` : 'Your partner Pokémon walks along through the app.'}</span>
            <div className="start-guide-partners" role="group" aria-label="Choose your partner">
              {QUICK_STARTERS.map((s) => (
                <button key={s.dex} type="button" aria-pressed={partner?.dex === s.dex} title={s.name} onClick={() => setPartnerChoice({ dex: s.dex, name: s.name })}>
                  <img src={spriteUrls(s.dex, false)[1]} alt={s.name} width={48} height={48} loading="lazy" />
                </button>
              ))}
            </div>
            <a className="small" href="#/settings">
              More partners in Settings
            </a>
          </div>
        </li>
        <li className={hasCards ? 'is-done' : undefined}>
          <StepMark done={hasCards} n={2} />
          <div>
            <strong>Scan your first card</strong>
            <span className="muted small">Each new card earns Pack points to open packs in the Pack game.</span>
            {!hasCards && (
              <a className="button-link primary" href="#/scan">
                <IconCamera size={18} />
                Scan cards
              </a>
            )}
          </div>
        </li>
        <li className={hasCards ? 'is-done' : undefined}>
          <StepMark done={hasCards} n={3} />
          <div>
            <strong>Or import your list</strong>
            <span className="muted small">Already keep your cards in a spreadsheet? Bring them in at once.</span>
            {!hasCards && (
              <a className="button-link" href="#/import">
                Import a spreadsheet
              </a>
            )}
          </div>
        </li>
      </ol>
      {allDone && (
        <button type="button" className="primary" onClick={() => setState('done')}>
          Close
        </button>
      )}
    </div>
  )
}

function StepMark({ done, n }: { done: boolean; n: number }): JSX.Element {
  return (
    <span className="start-guide-mark">
      {done ? <IconCheck size={16} /> : <span aria-hidden="true">{n}</span>}
      <span className="visually-hidden">{done ? 'Done: ' : `Step ${n}: `}</span>
    </span>
  )
}
