import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import { AccountActions, AnnouncementPanel, CrateAuditPanel, CrateRulesPanel, InvitePanel, ScansPanel, UserDetail } from '../components/AdminParts'
import { WaitlistPanel } from '../components/AdminWaitlist'
import { IconSearch } from '../components/Icons'
import { Loading } from '../components/Loading'
import { SearchClear } from '../components/SearchClear'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { actionText, plural, when } from '../lib/adminText'
import { REASON_MAX, grantCratePoints, grantInputError, isBanned, listAdminActions, listAdminUsers, type AdminAction, type AdminUser } from '../lib/admin'
import { errorText } from '../lib/errors'
import { closeKeyboardOnEnter } from '../lib/keyboard'

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
  const [open, setOpen] = useState<string | null>(null)

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
        <p className="muted">Users and Pack points. Only admins see this page.</p>
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
        <h2 className="panel-title">Give or take Pack points</h2>
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
                  {isBanned(u) && <span className="chip is-blocked">Blocked</span>}
                </div>
                <span className="muted small">
                  Joined {when(u.createdAt)} · last sign-in {when(u.lastSignInAt)}
                </span>
                <span className="small">
                  {plural(u.cards, 'card', 'cards')} · {plural(u.cratePoints, 'Pack point', 'Pack points')} · {plural(u.scans24h, 'scan', 'scans')} in 24 h
                  {u.scans30d > 0 ? ` (${u.scans30d.toLocaleString('en-GB')} in 30 days)` : ''} · {plural(u.errors7d, 'error', 'errors')} in 7 days
                  {u.scanPerDay !== null || u.scanPerMinute !== null ? ` · own scan limit ${u.scanPerMinute ?? 40}/min, ${u.scanPerDay ?? 500}/day` : ''}
                </span>
                <div className="settings-actions">
                  <button type="button" className="small-btn" onClick={() => pick(u)}>
                    Pack points…
                  </button>
                  <button type="button" className="small-btn" aria-expanded={open === u.id} onClick={() => setOpen(open === u.id ? null : u.id)}>
                    {open === u.id ? 'Hide details' : 'Details'}
                  </button>
                </div>
                {open === u.id && (
                  <UserDetail
                    user={u}
                    onChanged={() => setVersion((v) => v + 1)}
                    extra={u.isAdmin ? <p className="muted small">Admins cannot be blocked or deleted here.</p> : <AccountActions user={u} blocked={isBanned(u)} onChanged={() => setVersion((v) => v + 1)} />}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <WaitlistPanel onInvited={() => setVersion((v) => v + 1)} />
      <InvitePanel onInvited={() => setVersion((v) => v + 1)} />
      <CrateRulesPanel />
      <CrateAuditPanel />
      <ScansPanel />
      <AnnouncementPanel onSaved={() => setVersion((v) => v + 1)} />

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
                <strong className={a.action === 'grant_points' ? (a.points !== null && a.points < 0 ? 'error' : 'success') : undefined}>{actionText(a)}</strong>
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
