import { isNetworkError } from './errors'

/**
 * Foutlogboek (STAP16): crashes en onafgevangen fouten naar de tabel app_errors, zodat ze terug te zien zijn
 * zonder screenshots. Geen netwerkfouten (offline-ruis), elke fout één keer, hooguit MAX_PER_SESSION per sessie.
 * Zonder STAP16 of zonder login gebeurt er niets; loggen mag de app nooit zelf laten falen.
 */

const MAX_PER_SESSION = 20
const sent = new Set<string>()
let disabled = false

const cut = (text: string | null | undefined, max: number): string | null => (text ? text.slice(0, max) : null)

export function logError(err: unknown, kind: string): void {
  if (disabled || sent.size >= MAX_PER_SESSION || isNetworkError(err)) return
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const stack = err instanceof Error ? (err.stack ?? null) : null
  // Dezelfde melding één keer per sessie, ook als hij vaker of op meer plekken optreedt.
  if (sent.has(message)) return
  sent.add(message)
  void send({
    message: cut(message, 500) || 'Unknown error',
    stack: cut(stack, 4000),
    context: cut(`${window.location.hash || '#/'} ${kind}`, 200),
    app_build: cut(__APP_BUILD__, 40),
    user_agent: cut(navigator.userAgent, 300),
  })
}

async function send(row: Record<string, string | null>): Promise<void> {
  try {
    // Pas hier laden: wie de fout meldt (bv. de ErrorBoundary) hoeft de Supabase-client niet mee te nemen.
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    const { error } = await supabase.from('app_errors').insert(row)
    if (!error) return
    // Tabel bestaat nog niet (STAP16 niet gedraaid): deze sessie niet meer proberen.
    if (error.code === '42P01' || error.code === 'PGRST205') disabled = true
    console.warn('Fout loggen mislukt', error.message)
  } catch (e) {
    console.warn('Fout loggen mislukt', e)
  }
}

/** Onafgevangen fouten en afgewezen promises in de hele app loggen. */
export function initErrorLog(): void {
  window.addEventListener('error', (e) => logError(e.error ?? e.message, 'error'))
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'promise'))
}
