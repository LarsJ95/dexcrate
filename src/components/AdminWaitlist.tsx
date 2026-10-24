import { useEffect, useState, type JSX } from 'react'
import { MissingStepError, getWaitlist, markWaitlistInvited, removeFromWaitlist, type WaitlistEntry } from '../lib/admin'
import { when } from '../lib/adminText'
import { inviteUser } from '../lib/adminUsers'
import { errorText } from '../lib/errors'
import { Status } from './AdminParts'
import { Loading } from './Loading'

/** Melding bij een STAP die nog niet gedraaid is, anders de fout. */
const problemText = (err: unknown, fallback: string): string => (err instanceof MissingStepError ? err.message : errorText(err, fallback))

/**
 * Wachtlijst (STAP32): aanmeldingen van de landingspagina. Invite stuurt de gewone uitnodiging (admin-users) en markeert
 * de regel; Remove haalt iemand van de lijst (bv. op verzoek). Uitgenodigd verdwijnt na 30 dagen vanzelf.
 */
export function WaitlistPanel({ onInvited }: { onInvited: () => void }): JSX.Element {
  const [list, setList] = useState<WaitlistEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getWaitlist()
      .then((rows) => {
        if (!cancelled) {
          setList(rows)
          setLoadError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(problemText(err, 'Loading the waitlist failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [version])

  async function invite(entry: WaitlistEntry): Promise<void> {
    if (busy) return
    setBusy(entry.id)
    setResult(null)
    try {
      await inviteUser(entry.email)
      await markWaitlistInvited(entry.id)
      setResult({ ok: true, text: `Invitation sent to ${entry.email}.` })
      onInvited()
    } catch (err) {
      setResult({ ok: false, text: problemText(err, 'Inviting failed.') })
    } finally {
      setBusy(null)
      setVersion((v) => v + 1)
    }
  }

  async function remove(entry: WaitlistEntry): Promise<void> {
    if (busy) return
    setBusy(entry.id)
    setResult(null)
    try {
      await removeFromWaitlist(entry.id)
      setResult({ ok: true, text: `${entry.email} removed from the waitlist.` })
    } catch (err) {
      setResult({ ok: false, text: problemText(err, 'Removing failed.') })
    } finally {
      setBusy(null)
      setConfirm(null)
      setVersion((v) => v + 1)
    }
  }

  const waiting = list?.filter((e) => !e.invitedAt).length ?? 0

  return (
    <section className="panel" aria-labelledby="admin-waitlist-title">
      <h2 id="admin-waitlist-title" className="panel-title">
        Waitlist{list ? ` (${waiting} waiting)` : ''}
      </h2>
      <p className="muted small">People who asked for early access on dexcrate.com. Invited people disappear from this list after 30 days.</p>
      {loadError ? (
        <p className="error small" role="alert">
          {loadError}
        </p>
      ) : list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="empty">Nobody on the waitlist yet.</p>
      ) : (
        <ul className="admin-users">
          {list.map((e) => (
            <li key={e.id}>
              <div className="admin-user-main">
                <strong className="admin-email">{e.email}</strong>
                {e.invitedAt && <span className="chip">Invited</span>}
              </div>
              <span className="muted small">
                Signed up {when(e.createdAt)}
                {e.invitedAt ? ` · invited ${when(e.invitedAt)}` : ''}
              </span>
              {e.collects && <span className="small admin-email">{e.collects}</span>}
              <div className="settings-actions">
                {!e.invitedAt && (
                  <button type="button" className="small-btn" disabled={busy !== null} onClick={() => void invite(e)}>
                    {busy === e.id ? 'Sending…' : 'Invite'}
                  </button>
                )}
                {confirm === e.id ? (
                  <>
                    <button type="button" className="danger" disabled={busy !== null} onClick={() => void remove(e)}>
                      {busy === e.id ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button" className="small-btn" disabled={busy !== null} onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="small-btn" disabled={busy !== null} onClick={() => setConfirm(e.id)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Status result={result} />
    </section>
  )
}
