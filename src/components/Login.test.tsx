// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))

const { Login } = await import('./Login')

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('Login (24-10-2026: wachtwoord vergeten, registreren)', () => {
  it('wachtwoord vergeten: mail met link terug naar de app; altijd dezelfde melding', async () => {
    render(<Login />)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    await userEvent.type(screen.getByLabelText('Email'), ' ash@example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }))
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ash@example.com', { redirectTo: `${window.location.origin}${window.location.pathname}` })
    expect(screen.getByRole('status').textContent).toMatch(/If this email has an account/)
    await userEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })

  it('registreren staat dicht (geen VITE_SIGNUP_OPEN): geen knop', () => {
    render(<Login />)
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()
  })

  it('verlopen mail-link en verwijderd account: melding bij openen', () => {
    sessionStorage.setItem('dexcrate:account-deleted', '1')
    render(<Login linkError="That link has expired or was already used. Ask for a new one." />)
    expect(screen.getByRole('alert').textContent).toMatch(/expired/)
    expect(screen.getByRole('status').textContent).toMatch(/account and all your data have been deleted/)
    expect(sessionStorage.getItem('dexcrate:account-deleted')).toBeNull()
  })

  it('inloggen: fout in gewone taal', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } } as never)
    render(<Login />)
    await userEvent.type(screen.getByLabelText('Email'), 'ash@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'pikapika')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert').textContent).toBe('Incorrect email or password.')
  })
})

describe('registreren open (VITE_SIGNUP_OPEN=true)', () => {
  it('controleert wachtwoorden en akkoord, en vraagt daarna om de mail te bevestigen', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SIGNUP_OPEN', 'true')
    try {
      const { Login: OpenLogin } = await import('./Login')
      render(<OpenLogin />)
      await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
      await userEvent.type(screen.getByLabelText('Email'), 'misty@example.com')
      await userEvent.type(screen.getByLabelText('Password'), 'staryu123')
      await userEvent.type(screen.getByLabelText('Repeat password'), 'staryu123')
      await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
      expect(screen.getByRole('alert').textContent).toMatch(/agree to the terms/)
      expect(auth.signUp).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('checkbox'))
      await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
      expect(auth.signUp).toHaveBeenCalledWith({ email: 'misty@example.com', password: 'staryu123', options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } })
      expect(screen.getByRole('status').textContent).toMatch(/confirm your account/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
