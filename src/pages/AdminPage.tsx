import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import { IconSearch } from '../components/Icons'
import { Loading } from '../components/Loading'
import { SearchClear } from '../components/SearchClear'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { REASON_MAX, grantCratePoints, grantInputError, listAdminActions, listAdminUsers, type AdminAction, type AdminUser } from '../lib/admin'
import { errorText } from '../lib/errors'
import { closeKeyboardOnEnter } from '../lib/keyboard'

const when = (iso: string | null): string => {
  if (!iso) return 'never'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/**
 * Beheer (STAP21, 21-10-2026): gebruikers bekijken en Crate points toekennen of afhalen, met reden en logboek.
 * De database controleert of je beheerder bent; deze pagina toont alleen wat die functies teruggeven.
 */
export function AdminPage(): JSX.Element {
  const admin = useIsAdmin()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [actions, setActions] = useState<AdminAction[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState('')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  // Na elke actie opnieuw laden (lijst en logboek); de teller start het effect hieronder.
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!admin) return
    let cancelled = false
    Promise.all([listAdminUsers(), listAdminActions()])
      .then(([u, a]) => {
        if (cancelled) return
        setUsers(u)
        setActions(a)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(errorText(err, 'Loading failed.'))
        setUsers((u) => u ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [admin, version])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q))
  }, [users, query])

  const chosen = users?.find((u) => u.id === target) ?? null
  const amount = Number(points)
  const problem = points.trim() === '' ? null : grantInputError(amount, reason)

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy || !chosen) return
    const err = grantInputError(amount, reason)
    if (err) {
      setResult({ ok: false, text: err })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const balance = await grantCratePoints(chosen.id, amount, reason)
      setResult({ ok: true, text: `Done: ${chosen.email} now has ${plural(balance, 'point', 'points')}.` })
      setPoints('')
      setReason('')
      setVersion((v) => v + 1)
    } catch (err) {
      setResult({ ok: false, text: errorText(err, 'That did not work.') })
    } finally {
      setBusy(false)
    }
  }

  function pick(u: AdminUser): void {
    setTarget(u.id)
    setResult(null)
    document.getElementById('admin-grant')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>Admin</h1>
        <p className="muted">Users and Crate points. Only admins see this page.</p>
      </div>
    </div>
  )

  if (admin === undefined) {
    return (
      <section className="page admin">
        {head}
        <Loading />
      </section>
    )
  }
  if (!admin) {
    return (
      <section className="page admin">
        {head}
        <p className="empty">You are not an admin.</p>
      </section>
    )
  }

  return (
    <section className="page admin">
      {head}

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}

      <form id="admin-grant" className="panel admin-grant" onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="panel-title">Give or take Crate points</h2>
        <div className="form-grid">
          <label className="admin-wide">
            User
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a user</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} ({plural(u.cratePoints, 'pt', 'pts')})
                </option>
              ))}
            </select>
          </label>
          <label>
            Points
            <input type="number" inputMode="numeric" step={1} placeholder="e.g. 500 or -200" value={points} onChange={(e) => setPoints(e.target.value)} />
          </label>
          <label className="admin-wide">
            Reason
            <input value={reason} maxLength={REASON_MAX} placeholder="e.g. Thanks for testing" onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        {problem && <p className="muted small">{problem}</p>}
        <div className="settings-actions">
          <button type="submit" className="primary" disabled={busy || !chosen || points.trim() === '' || problem !== null}>
            {busy ? 'Saving…' : chosen && amount ? `${amount > 0 ? 'Give' : 'Take'} ${plural(Math.abs(amount), 'point', 'points')}` : 'Save'}
          </button>
          {result && (
            <span className={result.ok ? 'success' : 'error'} role={result.ok ? 'status' : 'alert'}>
              {result.text}
            </span>
          )}
        </div>
      </form>

      <section className="panel" aria-labelledby="admin-users-title">
        <h2 id="admin-users-title" className="panel-title">
          Users{users ? ` (${users.length})` : ''}
        </h2>
        <div className="search">
          <IconSearch size={18} />
          <input type="search" placeholder="Search by e-mail" aria-label="Search users by e-mail" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={closeKeyboardOnEnter} />
          <SearchClear value={query} onClear={() => setQuery('')} />
        </div>
        {users === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <p className="empty">{users.length === 0 ? 'No users.' : 'No user matches.'}</p>
        ) : (
          <ul className="admin-users">
            {shown.map((u) => (
              <li key={u.id}>
                <div className="admin-user-main">
                  <strong className="admin-email">{u.email}</strong>
                  {u.isAdmin && <span className="chip">Admin</span>}
                </div>
                <span className="muted small">
                  Joined {when(u.createdAt)} · last sign-in {when(u.lastSignInAt)}
                </span>
                <span className="small">
                  {plural(u.cards, 'card', 'cards')} · {plural(u.cratePoints, 'Crate point', 'Crate points')} · {plural(u.scans24h, 'scan', 'scans')} in 24 h ·{' '}
                  {plural(u.errors7d, 'error', 'errors')} in 7 days
                </span>
                <button type="button" className="small-btn" onClick={() => pick(u)}>
                  Crate points…
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="admin-log-title">
        <h2 id="admin-log-title" className="panel-title">
          Log
        </h2>
        {actions.length === 0 ? (
          <p className="empty">Nothing yet.</p>
        ) : (
          <ul className="admin-log">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="muted small">{when(a.createdAt)}</span>
                <span>
                  <strong className={a.points !== null && a.points < 0 ? 'error' : 'success'}>
                    {a.points !== null && a.points > 0 ? '+' : ''}
                    {a.points?.toLocaleString('en-GB') ?? '–'} pts
                  </strong>{' '}
                  {a.targetEmail ?? '(deleted user)'}
                </span>
                <span className="muted small">
                  “{a.reason}” · by {a.adminEmail ?? '(deleted admin)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
