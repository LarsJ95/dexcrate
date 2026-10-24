import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { resetAccount } from '../lib/accountReset'
import { checkForUpdate } from '../lib/appUpdate'
import { supabase } from '../lib/supabase'
import { Section } from './SettingsControls'
import { OFFLINE_TEXT, errorText, isNetworkError } from '../lib/errors'

// --- Account en gegevens ---

/** Lokaal bewaarde kaartinfo, prijzen, setlogo's en namen (worden opnieuw opgehaald). */
const CACHE_PREFIXES = ['tcgdex:', 'ptcg:', 'pokeapi:', 'pc:img:'] as const
const MIN_PASSWORD = 8

function clearAppCache(): number {
  let removed = 0
  try {
    for (const key of Object.keys(localStorage)) {
      if (CACHE_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key)
        removed += 1
      }
    }
  } catch (err) {
    console.warn('Cache leegmaken mislukt', err)
  }
  return removed
}

/** E-mailadres van wie er is ingelogd (null zolang het laadt). */
function useSignedInEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) throw error
        if (!cancelled) setEmail(data.user?.email ?? null)
      })
      .catch((err: unknown) => console.warn('Gebruiker ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])
  return email
}

/**
 * Bovenaan Settings (21-10-2026, op verzoek: update-knop bovenaan, logische volgorde): wie er is ingelogd, de versie
 * met "Check for updates", en uitloggen.
 */
export function AccountSummary(): JSX.Element {
  const email = useSignedInEmail()
  const [update, setUpdate] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Uitloggen mislukt', error)
  }

  async function lookForUpdate(): Promise<void> {
    if (checking) return
    setChecking(true)
    setUpdate('Checking…')
    try {
      const r = await checkForUpdate()
      setUpdate(r === 'updating' ? 'A new version is loading…' : r === 'latest' ? 'You have the latest version.' : 'Updates are not available here.')
    } catch (err) {
      setUpdate(isNetworkError(err) ? OFFLINE_TEXT : err instanceof Error ? `Checking failed: ${err.message}` : 'Checking failed.')
    } finally {
      setChecking(false)
    }
  }

  const built = new Date(__APP_BUILD__)
  return (
    <section className="panel settings-summary" aria-label="Your account and app version">
      <div className="settings-summary-who">
        <span className="stat-label">Signed in as</span>
        <strong className="settings-value">{email ?? '…'}</strong>
      </div>
      <div className="settings-summary-app">
        <span className="stat-label">App version</span>
        <span>{Number.isNaN(built.getTime()) ? 'Unknown date' : built.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        {update && (
          <span className="small" role="status">
            {update}
          </span>
        )}
      </div>
      <div className="settings-actions settings-summary-actions">
        <button type="button" className="primary" onClick={() => void lookForUpdate()} disabled={checking}>
          Check for updates
        </button>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </section>
  )
}

/** Je gegevens: back-up, import, beheer (alleen beheerders) en de app-cache op dit apparaat. */
export function DataSection(): JSX.Element {
  const [confirmClear, setConfirmClear] = useState(false)
  const admin = useIsAdmin() === true
  return (
    <Section id="settings-data" title="Data" scope="account" intro="Download everything as a backup, or bring cards in from a spreadsheet or another app.">
      <div className="settings-actions">
        <a className="button-link" href="#/backup">
          Backup and restore
        </a>
        <a className="button-link" href="#/import">
          Import
        </a>
        {admin && (
          <a className="button-link" href="#/admin">
            Admin
          </a>
        )}
      </div>
      <h3 className="settings-subtitle">This device</h3>
      <div className="settings-actions">
        {confirmClear ? (
          <>
            <span className="small">Clear stored card info and prices on this device? They are fetched again.</span>
            <button
              type="button"
              className="primary small-btn"
              onClick={() => {
                clearAppCache()
                window.location.reload()
              }}
            >
              Clear and reload
            </button>
            <button type="button" className="small-btn" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)}>
            Clear app cache
          </button>
        )}
      </div>
    </Section>
  )
}

/** Wachtwoord wijzigen. */
export function PasswordSection(): JSX.Element {
  const email = useSignedInEmail()
  const [pw, setPw] = useState({ next: '', again: '' })
  const [pwState, setPwState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  async function changePassword(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (pwBusy) return
    if (pw.next.length < MIN_PASSWORD) return setPwState({ ok: false, text: `Use at least ${MIN_PASSWORD} characters.` })
    if (pw.next !== pw.again) return setPwState({ ok: false, text: 'The two passwords are not the same.' })
    setPwBusy(true)
    setPwState(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw.next })
      if (error) throw error
      setPw({ next: '', again: '' })
      setPwState({ ok: true, text: 'Password changed.' })
    } catch (err) {
      setPwState({ ok: false, text: isNetworkError(err) ? OFFLINE_TEXT : err instanceof Error ? `Changing the password failed: ${err.message}` : 'Changing the password failed.' })
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <Section id="settings-password" title="Password" scope="account">
      <form className="settings-password" onSubmit={(e) => void changePassword(e)} noValidate>
        <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
        <div className="form-grid">
          <label>
            New password
            <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          </label>
          <label>
            Repeat new password
            <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={pw.again} onChange={(e) => setPw((p) => ({ ...p, again: e.target.value }))} />
          </label>
        </div>
        <div className="settings-actions">
          <button type="submit" disabled={pwBusy || !pw.next}>
            {pwBusy ? 'Saving…' : 'Change password'}
          </button>
          {pwState && (
            <span className={pwState.ok ? 'success' : 'error'} role={pwState.ok ? 'status' : 'alert'}>
              {pwState.text}
            </span>
          )}
        </div>
      </form>
    </Section>
  )
}

const RESET_WORD = 'RESET'

/** Account helemaal leegmaken om opnieuw te beginnen; je login blijft. */
export function ResetSection(): JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const ready = typed.trim() === RESET_WORD && !busy

  async function reset(): Promise<void> {
    if (!ready) return
    setBusy(true)
    setState(null)
    try {
      const r = await resetAccount()
      const cards = r.rows.cards ?? 0
      if (r.filesFailed > 0) {
        setState({ ok: false, text: `Your data is deleted (${cards} card rows), but ${r.filesFailed} files could not be removed. Type RESET and try again to remove them.` })
        setTyped('')
        return
      }
      setState({ ok: true, text: `Done: ${cards} card rows and ${r.filesRemoved} files deleted. Starting fresh…` })
      // Even tonen, dan schoon opnieuw beginnen op Overview (alles in het geheugen is dan ook weg).
      window.setTimeout(() => {
        window.location.hash = '#/overview'
        window.location.reload()
      }, 2000)
    } catch (err) {
      setState({ ok: false, text: errorText(err, 'Resetting failed. Nothing was deleted.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="settings-reset" title="Reset account" scope="account">
      <div className="settings-danger">
        <p>
          Start over from scratch. This permanently deletes <strong>all your cards, photos, sales and purchases, wishlist, goals, scan history and your Pack game</strong> (points,
          cards and packs). Levels, badges and secret achievements start again from zero. Your login, theme and scanning settings stay.
        </p>
        <p className="muted small">This cannot be undone. Make a backup first if you might want anything back.</p>
        <div className="settings-actions">
          <a className="button-link" href="#/backup">
            Make a backup first
          </a>
        </div>
        <label className="settings-confirm">
          Type {RESET_WORD} to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={RESET_WORD} disabled={busy} />
        </label>
        <div className="settings-actions">
          <button type="button" className="danger" onClick={() => void reset()} disabled={!ready}>
            {busy ? 'Deleting everything…' : 'Reset my account'}
          </button>
          {state && (
            <span className={state.ok ? 'success' : 'error'} role={state.ok ? 'status' : 'alert'}>
              {state.text}
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}
