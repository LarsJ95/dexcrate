import { useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { DELETED_KEY, SIGNUP_OPEN, appUrl } from '../lib/authLink'
import { PRIVACY_URL, TERMS_URL } from '../lib/legal'
import { supabase } from '../lib/supabase'
import { LogoMark } from './Icons'

type Mode = 'signin' | 'forgot' | 'signup'

const MIN_PASSWORD = 8

function readDeleted(): boolean {
  try {
    const v = sessionStorage.getItem(DELETED_KEY) === '1'
    sessionStorage.removeItem(DELETED_KEY)
    return v
  } catch {
    return false // geen opslag: geen melding
  }
}

/** Foutmeldingen van Supabase in gewone taal. */
function authText(message: string): string {
  if (message === 'Invalid login credentials') return 'Incorrect email or password.'
  if (/signups? not allowed|signup is disabled/i.test(message)) return 'Sign-ups are closed for now.'
  if (/rate limit|too many/i.test(message)) return 'Too many emails sent. Try again in an hour.'
  if (/already registered/i.test(message)) return 'This email already has an account. Sign in or reset your password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link in the email we sent.'
  return message
}

/**
 * Inlogscherm (24-10-2026 uitgebreid voor live gaan): inloggen, "Forgot password?" (mail met link) en registreren (alleen
 * als SIGNUP_OPEN aan staat). `linkError` = melding van een verlopen of al gebruikte mail-link.
 */
export function Login({ linkError = null }: { linkError?: string | null }): JSX.Element {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(linkError)
  const [notice, setNotice] = useState<string | null>(() => (readDeleted() ? 'Your account and all your data have been deleted.' : null))

  function switchTo(next: Mode): void {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const mail = email.trim()
    setError(null)
    setNotice(null)
    if (mode === 'signup') {
      if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
      if (password !== again) return setError('The two passwords are not the same.')
      if (!agree) return setError('Please agree to the terms and privacy policy.')
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (err) setError(authText(err.message))
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: appUrl() })
        // Altijd dezelfde melding: niet verraden of een adres een account heeft.
        if (err && /rate limit|too many/i.test(err.message)) setError(authText(err.message))
        else setNotice('If this email has an account, you will get an email with a link to choose a new password.')
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: appUrl() } })
        if (err) setError(authText(err.message))
        else if (!data.session) setNotice('Almost done: open the link in the email we sent you to confirm your account.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Reset password' : 'Create account'
  const submit = mode === 'signin' ? (busy ? 'Signing in…' : 'Sign in') : mode === 'forgot' ? (busy ? 'Sending…' : 'Send link') : busy ? 'Creating…' : 'Create account'

  return (
    <LoginFrame>
      <form onSubmit={onSubmit} noValidate={mode === 'signup'}>
        <div className="brand brand-lg">
          <LogoMark size={36} />
          <span>Dexcrate</span>
        </div>
        <h1>{title}</h1>
        {mode === 'forgot' && <p className="muted small login-hint">We will email you a link to choose a new password.</p>}
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {mode === 'signup' && (
          <>
            <label>
              Repeat password
              <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to the{' '}
                <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
                  terms
                </a>{' '}
                and the{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                  privacy policy
                </a>
              </span>
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {submit}
        </button>
        <p className="login-switch small">
          {mode === 'signin' ? (
            <>
              <button type="button" className="link-button" onClick={() => switchTo('forgot')}>
                Forgot password?
              </button>
              {SIGNUP_OPEN && (
                <>
                  {' · '}
                  <button type="button" className="link-button" onClick={() => switchTo('signup')}>
                    Create account
                  </button>
                </>
              )}
            </>
          ) : (
            <button type="button" className="link-button" onClick={() => switchTo('signin')}>
              Back to sign in
            </button>
          )}
        </p>
        <p className="login-legal muted small">
          <a href={PRIVACY_URL}>Privacy</a> · <a href={TERMS_URL}>Terms of use</a>
        </p>
      </form>
    </LoginFrame>
  )
}

/** Zelfde opmaak als het inlogscherm, ook voor "kies een wachtwoord" (SetPassword). */
export function LoginFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="login">
      <section className="login-brand" aria-hidden="true">
        <div className="login-fan">
          <span />
          <span />
          <span />
        </div>
        <p className="login-tagline">Your collection, sales and market value in one place.</p>
      </section>
      <section className="login-panel">{children}</section>
    </main>
  )
}
