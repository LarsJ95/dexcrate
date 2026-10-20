import { useId, type JSX, type ReactNode } from 'react'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { IconArrowDown } from './Icons'

const STATES = ['open', 'closed'] as const

/**
 * Alleen op de telefoon een omhulsel met een eigen klasse (bv. voor een andere volgorde, audit O1). Groter scherm:
 * de inhoud zonder omhulsel, zodat bestaande opmaak (zoals `.dash-main > .spotlight`) gewoon blijft werken.
 */
export function PhoneSlot({ className, children }: { className: string; children: ReactNode }): JSX.Element {
  const phone = useMediaQuery(PHONE_QUERY)
  return phone ? <div className={className}>{children}</div> : <>{children}</>
}

/**
 * Blok dat op de telefoon inklapbaar is (audit O1, 20-10-2026): kop met titel en een korte samenvatting, inhoud pas na
 * tikken. Open of dicht wordt per blok onthouden (dit apparaat). Groter scherm: gewoon de inhoud, niets verandert.
 */
export function PhoneFold({ id, title, summary, className = '', children }: { id: string; title: string; summary?: ReactNode; className?: string; children: ReactNode }): JSX.Element {
  const phone = useMediaQuery(PHONE_QUERY)
  const [state, setState] = useStoredChoice(`dexcrate:fold:${id}`, STATES, 'closed')
  const bodyId = useId()
  if (!phone) return <>{children}</>
  const open = state === 'open'
  return (
    <div className={`phone-fold${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="phone-fold-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setState(open ? 'closed' : 'open')}>
        <span className="phone-fold-title">{title}</span>
        {summary && <span className="phone-fold-summary">{summary}</span>}
        <IconArrowDown size={18} />
      </button>
      {open && (
        <div id={bodyId} className="phone-fold-body">
          {children}
        </div>
      )}
    </div>
  )
}
