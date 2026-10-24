import { useState, type FormEvent, type JSX } from 'react'
import { supabase } from '../lib/supabase'
import { LogoMark } from './Icons'
import { LoginFrame } from './Login'

const MIN_PASSWORD = 8

/**
 * Na een uitnodiging of "Forgot password?" (24-10-2026): eerst een (nieuw) wachtwoord kiezen, dan naar de app.
 * Je bent dan al ingelogd via de mail-link; uitloggen kan ook.
 */
export function SetPassword({ invited, onDone }: { invited: boolean; onDone: () => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== again) return setError('The two passwords are not the same.')
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      onDone()
    } catch (err) {
      setError(err instanceof Error ? `Saving the password failed: ${err.message}` : 'Saving the password failed.')
      setBusy(false)
    }
  }

  return (
    <LoginFrame>
      <form onSubmit={onSubmit} noValidate>
        <div className="brand brand-lg">
          <LogoMark size={36} />
          <span>Dexcrate</span>
        </div>
        <h1>{invited ? 'Welcome!' : 'New password'}</h1>
        <p className="muted small login-hint">{invited ? 'Choose a password to finish your account.' : 'Choose a new password for your account.'}</p>
        <label>
          Password
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Repeat password
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        <p className="login-switch small">
          <button type="button" className="link-button" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </p>
      </form>
    </LoginFrame>
  )
}
