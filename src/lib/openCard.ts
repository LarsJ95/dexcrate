/**
 * Een kaart uit je collectie openen vanaf een andere plek (zoeken, 21-10-2026). Niet via het adres: My cards opent de
 * kaart zodra de lijst geladen is, en de terugknop blijft gewoon werken.
 */
export const OPEN_CARD_EVENT = 'dexcrate:open-card'

let pending: string | null = null

/** Naar My cards en daar deze kaart openen (staat My cards al open, dan meteen). */
export function requestOpenCard(id: string): void {
  pending = id
  if (/^#\/collection(\/|$)/.test(window.location.hash)) window.dispatchEvent(new Event(OPEN_CARD_EVENT))
  else window.location.hash = '#/collection'
}

/** Kaart die geopend moet worden (alleen kijken; StrictMode roept beginwaarden twee keer aan). */
export function pendingCard(): string | null {
  return pending
}

export function clearPendingCard(): void {
  pending = null
}
