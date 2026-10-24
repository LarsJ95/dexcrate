import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { deleteAccount, resetAccount } from '../lib/accountReset'
import { DELETED_KEY } from '../lib/authLink'
import { checkForUpdate } from '../lib/appUpdate'
import { supabase } from '../lib/supabase'
import { Group, LinkRow, More, Row } from './SettingsControls'
import { PRIVACY_URL, SOURCES, TERMS_URL } from '../lib/legal'
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
        <strong className="settings-value">{email ?? '…'}</strong>
        <span className="muted small">
          Version {Number.isNaN(built.getTime()) ? 'unknown' : built.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}
          <button type="button" className="link-button" onClick={() => void lookForUpdate()} disabled={checking}>
            Check for updates
          </button>
        </span>
        {update && (
          <span className="small" role="status">
            {update}
          </span>
        )}
      </div>
      <button type="button" className="small-btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </section>
  )
}

/** Je gegevens: back-up, import, beheer (alleen beheerders) en de app-cache op dit apparaat. */
export function DataGroup(): JSX.Element {
  const [confirmClear, setConfirmClear] = useState(false)
  const admin = useIsAdmin() === true
  return (
    <Group title="Data">
      <LinkRow href="#/backup">Backup and restore</LinkRow>
      <LinkRow href="#/import">Import</LinkRow>
      {admin && <LinkRow href="#/admin">Admin</LinkRow>}
      <Row label="Clear app cache" hint={confirmClear ? 'Card info and prices are fetched again' : undefined}>
        {confirmClear ? (
          <span className="settings-actions">
            <button type="button" className="small-btn" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary small-btn"
              onClick={() => {
                clearAppCache()
                window.location.reload()
              }}
            >
              Clear
            </button>
          </span>
        ) : (
          <button type="button" className="small-btn" onClick={() => setConfirmClear(true)}>
            Clear
          </button>
        )}
      </Row>
    </Group>
  )
}

/** Privacy, voorwaarden en waar de gegevens vandaan komen (24-10-2026). */
export function AboutGroup(): JSX.Element {
  return (
    <Group title="About">
      <LinkRow href={PRIVACY_URL} external>
        Privacy
      </LinkRow>
      <LinkRow href={TERMS_URL} external>
        Terms of use
      </LinkRow>
      <More label="Sources and credits">
        <p className="muted small">
          Dexcrate is an independent fan project, not affiliated with Nintendo, The Pokémon Company, Creatures, GAME FREAK or Cardmarket. Pokémon names are trademarks of
          Nintendo; card images belong to their owners.
        </p>
        <ul className="settings-sources">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name}
              </a>
              : {s.what}
            </li>
          ))}
        </ul>
      </More>
    </Group>
  )
}

/** Wachtwoord en account leegmaken, allebei uitgeklapt pas als je ze nodig hebt. */
export function AccountGroup(): JSX.Element {
  return (
    <Group title="Account">
      <PasswordRow />
      <ResetRow />
      <DeleteRow />
    </Group>
  )
}

/** Wachtwoord wijzigen. */
function PasswordRow(): JSX.Element {
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
    <More label="Change password">
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
    </More>
  )
}

/** Account helemaal verwijderen (AVG, 24-10-2026): bevestigen met je e-mailadres. */
function DeleteRow(): JSX.Element {
  const email = useSignedInEmail()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = !!email && typed.trim().toLowerCase() === email.toLowerCase() && !busy

  async function remove(): Promise<void> {
    if (!ready) return
    setBusy(true)
    setError(null)
    // Melding voor het inlogscherm, dat na het uitloggen verschijnt.
    try {
      sessionStorage.setItem(DELETED_KEY, '1')
    } catch (err) {
      console.warn('Melding onthouden mislukt', err)
    }
    try {
      await deleteAccount(typed)
    } catch (err) {
      try {
        sessionStorage.removeItem(DELETED_KEY)
      } catch (err2) {
        console.warn('Melding weghalen mislukt', err2)
      }
      setError(errorText(err, 'Deleting the account failed.'))
      setBusy(false)
    }
  }

  return (
    <More label="Delete account" danger>
      <div className="settings-danger">
        <p>
          Deletes your account and <strong>everything in it</strong>: cards, photos, sales, wishlist and Pack game. You cannot sign in with it again. This cannot be undone.
        </p>
        <div className="settings-actions">
          <a className="button-link" href="#/backup">
            Make a backup first
          </a>
        </div>
        <label className="settings-confirm">
          Type your email address to confirm
          <input type="email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={email ?? ''} disabled={busy} />
        </label>
        <div className="settings-actions">
          <button type="button" className="danger" onClick={() => void remove()} disabled={!ready}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
          {error && (
            <span className="error" role="alert">
              {error}
            </span>
          )}
        </div>
      </div>
    </More>
  )
}

const RESET_WORD = 'RESET'

/** Account helemaal leegmaken om opnieuw te beginnen; je login blijft. */
function ResetRow(): JSX.Element {
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
    <More label="Reset account" danger>
      <div className="settings-danger">
        <p>
          Deletes <strong>all your cards, photos, sales, wishlist and Pack game</strong>. Your login and settings stay. This cannot be undone.
        </p>
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
    </More>
  )
}
