/**
 * Mail-links van Supabase (24-10-2026): "wachtwoord vergeten", uitnodiging en registratie komen terug met de gegevens
 * achter # in het adres (bv. "#access_token=…&type=recovery", of "#error=…&error_description=…" als de link verlopen
 * is). Supabase haalt dat er bij het starten zelf uit; daarom lezen we het één keer vóór de client start (supabase.ts).
 */
export type AuthLinkType = 'recovery' | 'invite' | 'signup' | 'magiclink' | 'email_change'

export interface AuthLink {
  type: AuthLinkType | null
  /** Foutmelding van Supabase (verlopen of al gebruikte link), voor het inlogscherm. */
  error: string | null
}

const TYPES: readonly AuthLinkType[] = ['recovery', 'invite', 'signup', 'magiclink', 'email_change']

/** Pure: wat staat er in dit adres-achter-#? Niets herkenbaars = { type: null, error: null }. */
export function parseAuthLink(hash: string): AuthLink {
  const raw = hash.replace(/^#\/?/, '')
  if (!raw.includes('=')) return { type: null, error: null }
  const p = new URLSearchParams(raw)
  if (p.has('error') || p.has('error_description')) {
    const code = p.get('error_code') ?? ''
    const text = code === 'otp_expired' ? 'That link has expired or was already used. Ask for a new one.' : (p.get('error_description') ?? 'That link did not work.').slice(0, 200)
    return { type: null, error: text }
  }
  if (!p.has('access_token')) return { type: null, error: null }
  const t = p.get('type')
  return { type: TYPES.find((x) => x === t) ?? null, error: null }
}

/** Adres van de app zelf (zonder #), waar de mail-link naartoe moet. */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/** Na uitnodiging of "wachtwoord vergeten" moet je eerst een (nieuw) wachtwoord kiezen. */
export const needsNewPassword = (type: AuthLinkType | null): boolean => type === 'recovery' || type === 'invite'

/**
 * Het adres bij het openen van de app. main.tsx importeert dit bestand als eerste, dus dit wordt gelezen voordat de
 * Supabase-client (supabase.ts) start en het adres opruimt. Een foutmelding halen we zelf uit het adres.
 */
export const startLink: AuthLink = typeof window === 'undefined' ? { type: null, error: null } : parseAuthLink(window.location.hash)
if (startLink.error && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', appUrl())

/** Melding na "Delete account" (Settings), één keer op het inlogscherm (sessionStorage). */
export const DELETED_KEY = 'dexcrate:account-deleted'

/** Registreren staat open (repository variable VITE_SIGNUP_OPEN = "true"); anders alleen op uitnodiging. */
export const SIGNUP_OPEN = import.meta.env.VITE_SIGNUP_OPEN === 'true'
