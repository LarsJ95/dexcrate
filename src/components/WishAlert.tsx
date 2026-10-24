import { useEffect, type JSX } from 'react'
import { useDismissedIds } from '../hooks/useDismissedIds'
import type { Route } from '../lib/routes'
import { IconClose } from './Icons'

const KEY = 'dexcrate:wish-deals-seen'

/**
 * Melding bovenaan als er een wens binnen je max. prijs is gezakt die je nog niet zag (24-10-2026, keuze gebruiker:
 * in de app, geen push of e-mail). Wegklikken, de knop of de Wishlist openen = gezien; zakt er later een andere wens
 * (of dezelfde opnieuw, na eerst gestegen te zijn) onder je max, dan verschijnt hij weer.
 */
export function WishAlert({ ids, route }: { ids: readonly string[]; route: Route }): JSX.Element | null {
  const { hasNew, dismiss } = useDismissedIds(KEY)
  const fresh = ids.length > 0 && hasNew(ids)

  useEffect(() => {
    if (route === 'wishlist' && fresh) dismiss(ids)
  }, [route, fresh, ids, dismiss])

  if (!fresh || route === 'wishlist') return null
  const n = ids.length
  return (
    <div className="notice-dismissable wish-alert">
      <button
        type="button"
        className="notice notice-action"
        onClick={() => {
          dismiss(ids)
          window.location.hash = '#/wishlist'
        }}
      >
        <span>
          <strong>A wild deal appeared!</strong> {n} {n === 1 ? 'wishlist card is' : 'wishlist cards are'} now within your max. price.
        </span>
      </button>
      <button type="button" className="ghost icon-btn notice-dismiss" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(ids)}>
        <IconClose />
      </button>
    </div>
  )
}
