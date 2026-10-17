/** Melding als er geen internet is (in plaats van "Failed to fetch" en varianten per browser). */
export const OFFLINE_TEXT = 'No internet connection. Check your connection and try again.'

// Chrome: "Failed to fetch", Safari: "Load failed", Firefox: "NetworkError when attempting to fetch resource."
const NETWORK = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i

/** Fout door een ontbrekende of weggevallen internetverbinding. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return NETWORK.test(message)
}

/** Tekst voor de gebruiker: duidelijke melding bij geen verbinding, anders de foutmelding of de standaardtekst. */
export function errorText(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return OFFLINE_TEXT
  return err instanceof Error && err.message ? err.message : fallback
}
