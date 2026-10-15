import { useState, type FormEvent, type JSX } from 'react'
import { supabase } from '../lib/supabase'
import { LogoMark } from './Icons'

export function Login(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(err.message === 'Invalid login credentials' ? 'Incorrect email or password.' : err.message)
    setBusy(false)
  }

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
      <section className="login-panel">
        <form onSubmit={onSubmit}>
          <div className="brand brand-lg">
            <LogoMark size={36} />
            <span>Dexcrate</span>
          </div>
          <h1>Sign in</h1>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
