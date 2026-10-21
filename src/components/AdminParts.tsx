import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react'
import {
  CRAFT_KEYS,
  MissingStepError,
  PACK_KEYS,
  REASON_MAX,
  SCAN_COST_EUR,
  getAdminRules,
  getScanStats,
  listUserErrors,
  listUserLedger,
  reasonError,
  setAdminRules,
  setAnnouncement,
  setScanLimit,
  type AdminCrateRules,
  type AdminUser,
  type LedgerEntry,
  type ScanDay,
  type UserError,
} from '../lib/admin'
import { LEDGER_LABELS, plural, when } from '../lib/adminText'
import { deleteUser, inviteUser, setBlocked } from '../lib/adminUsers'
import { errorText } from '../lib/errors'
import { Loading } from './Loading'

/** Melding bij een STAP die nog niet gedraaid is, anders de fout. */
function problemText(err: unknown, fallback: string): string {
  return err instanceof MissingStepError ? err.message : errorText(err, fallback)
}

function Status({ result }: { result: { ok: boolean; text: string } | null }): JSX.Element | null {
  if (!result) return null
  return (
    <span className={result.ok ? 'success' : 'error'} role={result.ok ? 'status' : 'alert'}>
      {result.text}
    </span>
  )
}

/** Puntengeschiedenis, fouten en scanlimiet van één gebruiker (STAP22). `extra` = acties uit admin-users. */
export function UserDetail({ user, onChanged, extra }: { user: AdminUser; onChanged: () => void; extra?: ReactNode }): JSX.Element {
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null)
  const [errors, setErrors] = useState<UserError[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [minute, setMinute] = useState(user.scanPerMinute?.toString() ?? '')
  const [day, setDay] = useState(user.scanPerDay?.toString() ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listUserLedger(user.id), listUserErrors(user.id)])
      .then(([l, e]) => {
        if (cancelled) return
        setLedger(l)
        setErrors(e)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(problemText(err, 'Loading failed.'))
        setLedger([])
        setErrors([])
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  const limitOf = (v: string): number | null => (v.trim() === '' ? null : Number(v))
  async function saveLimit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const m = limitOf(minute)
    const d = limitOf(day)
    const bad = (m !== null && (!Number.isInteger(m) || m < 1 || m > 200)) || (d !== null && (!Number.isInteger(d) || d < 1 || d > 10000))
    const problem = bad ? 'Per minute 1–200, per day 1–10,000 (empty = default).' : reasonError(reason)
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      await setScanLimit(user.id, m, d, reason)
      setResult({ ok: true, text: m === null && d === null ? 'Back to the default limit.' : 'Scan limit saved.' })
      setReason('')
      onChanged()
    } catch (err) {
      setResult({ ok: false, text: problemText(err, 'Saving failed.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-detail">
      {loadError && <p className="error">{loadError}</p>}
      <h3>Points history</h3>
      {ledger === null ? (
        <Loading />
      ) : ledger.length === 0 ? (
        <p className="muted small">No points yet.</p>
      ) : (
        <ul className="admin-mini">
          {ledger.map((l, i) => (
            <li key={`${l.kind}-${l.ref}-${i}`}>
              <span className="small">
                {LEDGER_LABELS[l.kind] ?? l.kind} <span className="muted">· {when(l.createdAt)}</span>
              </span>
              <strong className={`small ${l.points < 0 ? 'error' : 'success'}`}>
                {l.points > 0 ? '+' : ''}
                {l.points.toLocaleString('en-GB')}
              </strong>
            </li>
          ))}
        </ul>
      )}

      <h3>Errors (last 50)</h3>
      {errors === null ? (
        <Loading />
      ) : errors.length === 0 ? (
        <p className="muted small">No errors.</p>
      ) : (
        <ul className="admin-mini">
          {errors.map((e, i) => (
            <li key={`${e.createdAt}-${i}`}>
              <strong className="small wide">{e.message}</strong>
              <span className="muted small wide">
                {when(e.createdAt)}
                {e.context ? ` · ${e.context}` : ''}
                {e.appBuild ? ` · version ${when(e.appBuild)}` : ''}
              </span>
              {e.userAgent && <span className="muted small wide">{e.userAgent}</span>}
              {e.stack && (
                <details className="wide">
                  <summary className="small">Stack</summary>
                  <pre>{e.stack}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="admin-limit" onSubmit={(e) => void saveLimit(e)} noValidate>
        <h3>Scan limit</h3>
        <p className="muted small">Empty = default (40 per minute, 500 per day).</p>
        <div className="form-grid">
          <label>
            Per minute
            <input type="number" inputMode="numeric" min={1} max={200} placeholder="40" value={minute} onChange={(e) => setMinute(e.target.value)} />
          </label>
          <label>
            Per day
            <input type="number" inputMode="numeric" min={1} max={10000} placeholder="500" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="admin-wide">
            Reason
            <input value={reason} maxLength={REASON_MAX} placeholder="e.g. Heavy tester" onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <div className="settings-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save scan limit'}
          </button>
          <Status result={result} />
        </div>
      </form>
      {extra}
    </div>
  )
}

/** Blokkeren/deblokkeren en verwijderen via admin-users. Niet voor jezelf of andere beheerders (de functie weigert dat ook). */
export function AccountActions({ user, blocked, onChanged }: { user: AdminUser; blocked: boolean; onChanged: () => void }): JSX.Element {
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(work: () => Promise<string>): Promise<void> {
    if (busy) return
    const problem = reasonError(reason)
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      setResult({ ok: true, text: await work() })
      setReason('')
      onChanged()
    } catch (err) {
      setResult({ ok: false, text: errorText(err, 'That did not work.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-account">
      <h3>Account</h3>
      <label>
        Reason
        <input value={reason} maxLength={REASON_MAX} placeholder="e.g. Asked to delete the account" onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="settings-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => (await setBlocked(user.id, !blocked, reason), blocked ? 'Account unblocked.' : 'Account blocked: they cannot sign in.'))}>
          {blocked ? 'Unblock account' : 'Block account'}
        </button>
        {!deleting && (
          <button type="button" className="danger" disabled={busy} onClick={() => setDeleting(true)}>
            Delete account…
          </button>
        )}
      </div>
      {deleting && (
        <div className="admin-delete settings-danger">
          <p className="small">
            Deletes the account, all cards, photos, receipts, wishlist and Crate data of <strong>{user.email}</strong>. This cannot be undone.
          </p>
          <label>
            Type the e-mail address to confirm
            <input type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <div className="settings-actions">
            <button
              type="button"
              className="danger"
              disabled={busy || confirm.trim().toLowerCase() !== user.email.toLowerCase()}
              onClick={() => void run(async () => `Deleted, with ${plural(await deleteUser(user.id, confirm, reason), 'file', 'files')}.`)}
            >
              {busy ? 'Deleting…' : 'Delete for good'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Status result={result} />
    </div>
  )
}

/** Iemand uitnodigen (aanmelden staat uit): mail met een link om een wachtwoord te kiezen. */
export function InvitePanel({ onInvited }: { onInvited: () => void }): JSX.Element {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function invite(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setResult({ ok: false, text: 'Enter a valid e-mail address.' })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      await inviteUser(email)
      setResult({ ok: true, text: `Invitation sent to ${email.trim()}.` })
      setEmail('')
      onInvited()
    } catch (err) {
      setResult({ ok: false, text: errorText(err, 'Inviting failed.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" aria-labelledby="admin-invite-title" onSubmit={(e) => void invite(e)} noValidate>
      <h2 id="admin-invite-title" className="panel-title">
        Invite someone
      </h2>
      <p className="muted small">They get an e-mail with a link to set a password and open Dexcrate.</p>
      <div className="form-grid">
        <label className="admin-wide">
          E-mail
          <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <div className="settings-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
        <Status result={result} />
      </div>
    </form>
  )
}

const PACK_LABELS: Record<(typeof PACK_KEYS)[number], string> = { booster: 'Booster', great: 'Great', master: 'Master', set: 'Set pack', type: 'Type pack' }
const CRAFT_LABELS: Record<(typeof CRAFT_KEYS)[number], string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare / holo',
  double: 'Double / Ultra rare',
  illustration: 'Illustration rare',
  special: 'SIR / Hyper / secret',
}

/** Crate-regels wijzigen (STAP22). */
export function CrateRulesPanel(): JSX.Element {
  const [rules, setRules] = useState<AdminCrateRules | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const toForm = (r: AdminCrateRules): Record<string, string> => ({
    daily: String(r.daily),
    trade_factor: String(r.trade_factor),
    crate_set: String(r.crate_set),
    ...Object.fromEntries(PACK_KEYS.map((k) => [`packs.${k}`, String(r.packs[k])])),
    ...Object.fromEntries(CRAFT_KEYS.map((k) => [`craft.${k}`, String(r.craft[k])])),
  })

  useEffect(() => {
    let cancelled = false
    getAdminRules()
      .then((r) => {
        if (cancelled) return
        setRules(r)
        setForm(toForm(r))
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ ok: false, text: problemText(err, 'Loading the rules failed.') })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy || !rules) return
    const int = (k: string): number => Number(form[k])
    const keys = Object.keys(form)
    if (keys.some((k) => form[k].trim() === '' || !Number.isInteger(int(k)))) {
      setResult({ ok: false, text: 'Every field needs a whole number.' })
      return
    }
    const problem = reasonError(reason)
    if (problem) {
      setResult({ ok: false, text: problem })
      return
    }
    const next: AdminCrateRules = {
      daily: int('daily'),
      trade_factor: int('trade_factor'),
      crate_set: int('crate_set'),
      packs: Object.fromEntries(PACK_KEYS.map((k) => [k, int(`packs.${k}`)])) as AdminCrateRules['packs'],
      craft: Object.fromEntries(CRAFT_KEYS.map((k) => [k, int(`craft.${k}`)])) as AdminCrateRules['craft'],
    }
    setBusy(true)
    setResult(null)
    try {
      const saved = await setAdminRules(next, reason)
      setRules(saved)
      setForm(toForm(saved))
      setReason('')
      setResult({ ok: true, text: 'Rules saved. The Crate page uses them after a reload.' })
    } catch (err) {
      setResult({ ok: false, text: problemText(err, 'Saving failed.') })
    } finally {
      setBusy(false)
    }
  }

  const field = (key: string, label: string, min = 0): JSX.Element => (
    <label key={key}>
      {label}
      <input type="number" inputMode="numeric" min={min} step={1} value={form[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  )

  return (
    <form className="panel admin-rules" onSubmit={(e) => void save(e)} noValidate aria-labelledby="admin-rules-title">
      <h2 id="admin-rules-title" className="panel-title">
        Crate rules
      </h2>
      {!rules && !result && <Loading />}
      {rules && (
        <>
          <fieldset>
            <legend>Points</legend>
            <div className="form-grid">
              {field('daily', 'Daily bonus')}
              {field('trade_factor', 'Trade-in factor', 1)}
              {field('crate_set', 'Crate set complete')}
            </div>
          </fieldset>
          <fieldset>
            <legend>Pack prices</legend>
            <div className="form-grid">{PACK_KEYS.map((k) => field(`packs.${k}`, PACK_LABELS[k]))}</div>
          </fieldset>
          <fieldset>
            <legend>Buy a missing card</legend>
            <div className="form-grid">{CRAFT_KEYS.map((k) => field(`craft.${k}`, CRAFT_LABELS[k], 1))}</div>
          </fieldset>
          <label>
            Reason
            <input value={reason} maxLength={REASON_MAX} placeholder="e.g. Great pack was too expensive" onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      )}
      <div className="settings-actions">
        {rules && (
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save rules'}
          </button>
        )}
        <Status result={result} />
      </div>
    </form>
  )
}

/** Scans per dag (14 dagen) met een kostenindicatie (STAP22). */
export function ScansPanel(): JSX.Element {
  const [days, setDays] = useState<ScanDay[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getScanStats(14)
      .then((d) => {
        if (!cancelled) setDays(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(problemText(err, 'Loading scans failed.'))
          setDays([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const total = (days ?? []).reduce((n, d) => n + d.scans, 0)
  const max = Math.max(1, ...(days ?? []).map((d) => d.scans))
  return (
    <section className="panel" aria-labelledby="admin-scans-title">
      <h2 id="admin-scans-title" className="panel-title">
        Scans
      </h2>
      {error && <p className="error">{error}</p>}
      {days === null ? (
        <Loading />
      ) : (
        <>
          <p className="small">
            {plural(total, 'scan', 'scans')} in 14 days · about €{(total * SCAN_COST_EUR).toFixed(2)}{' '}
            <span className="muted">(estimate: ±€{SCAN_COST_EUR.toFixed(3)} per scan; Look again and binder pages cost more)</span>
          </p>
          <ul className="admin-mini admin-scans">
            {days.map((d) => (
              <li key={d.day}>
                <span className="small">{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="meter" aria-hidden="true">
                  <span className="meter-fill" style={{ width: `${(d.scans / max) * 100}%` }} />
                </span>
                <span className="small">
                  {d.scans.toLocaleString('en-GB')} · {plural(d.users, 'user', 'users')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Mededeling voor alle gebruikers (STAP22). */
export function AnnouncementPanel({ onSaved }: { onSaved: () => void }): JSX.Element {
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState<'info' | 'warning'>('info')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(remove: boolean): Promise<void> {
    if (busy) return
    const text = remove ? '' : message.trim()
    if (!remove && (text.length < 3 || text.length > 300)) {
      setResult({ ok: false, text: 'Write 3 to 300 characters.' })
      return
    }
    setBusy(true)
    setResult(null)
    try {
      await setAnnouncement(text, level)
      setResult({ ok: true, text: remove ? 'Announcement removed.' : 'Announcement shown to everyone.' })
      if (!remove) setMessage('')
      onSaved()
    } catch (err) {
      setResult({ ok: false, text: problemText(err, 'Saving failed.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="panel"
      aria-labelledby="admin-announce-title"
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
      noValidate
    >
      <h2 id="admin-announce-title" className="panel-title">
        Announcement
      </h2>
      <p className="muted small">Shown at the top of the app for every user until they dismiss it. A new one replaces the old one.</p>
      <div className="form-grid">
        <label className="admin-wide">
          Message
          <input value={message} maxLength={300} placeholder="e.g. New: buy a missing card in the Crate" onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label>
          Kind
          <select value={level} onChange={(e) => setLevel(e.target.value === 'warning' ? 'warning' : 'info')}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
          </select>
        </label>
      </div>
      <div className="settings-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Show to everyone'}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void save(true)}>
          Remove current
        </button>
        <Status result={result} />
      </div>
    </form>
  )
}
