import { describe, expect, it } from 'vitest'
import { needsNewPassword, parseAuthLink } from './authLink'

describe('parseAuthLink: mail-links van Supabase', () => {
  it('wachtwoord vergeten en uitnodiging: daarna een wachtwoord kiezen', () => {
    const recovery = parseAuthLink('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')
    expect(recovery).toEqual({ type: 'recovery', error: null })
    expect(needsNewPassword(recovery.type)).toBe(true)
    expect(needsNewPassword(parseAuthLink('#access_token=abc&type=invite').type)).toBe(true)
    expect(needsNewPassword(parseAuthLink('#access_token=abc&type=signup').type)).toBe(false)
  })

  it('verlopen of al gebruikte link: nette melding', () => {
    expect(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired').error).toMatch(/expired or was already used/)
    expect(parseAuthLink('#error=server_error&error_description=Something+broke').error).toBe('Something broke')
  })

  it('gewone pagina-adressen van de app: niets', () => {
    for (const h of ['', '#', '#/overview', '#/sets/en/sv01', '#/wishlist']) expect(parseAuthLink(h)).toEqual({ type: null, error: null })
    expect(parseAuthLink('#type=recovery')).toEqual({ type: null, error: null })
    expect(parseAuthLink('#access_token=abc&type=bogus')).toEqual({ type: null, error: null })
  })
})
