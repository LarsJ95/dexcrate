import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { resetAccount } from '../lib/accountReset'
import { checkForUpdate } from '../lib/appUpdate'
import { AUTO_GAPS, setPref, usePrefs, type AutoGap, type ScanModePref, type ThemeChoice } from '../lib/devicePrefs'
import { setMotionPreference, useMotion, useMotionPreference } from '../lib/motion'
import { STARTERS, setPartnerChoice, usePartner, usePartnerChoice } from '../lib/partner'
import { spriteUrls } from '../lib/runner'
import { supabase } from '../lib/supabase'
import { CONDITION_LABELS, LANGUAGE_LABELS, type CardLanguage, type Condition } from '../lib/types'
import type { NewCardDefaults, UserSettings } from '../lib/valuation'
import { hasValuations, loadSettings, saveSettings } from '../lib/valuationDb'
import { Loading } from '../components/Loading'

type Scope = 'device' | 'account'

/** Eén blok instellingen; rechtsboven waar het bewaard wordt. */
function Section({ title, scope, children, intro }: { title: string; scope: Scope; children: ReactNode; intro?: string }): JSX.Element {
  return (
    <section className="panel settings-section" aria-labelledby={`settings-${title}`}>
      <header className="settings-head">
        <h2 id={`settings-${title}`}>{title}</h2>
        <span className={`settings-scope scope-${scope}`}>{scope === 'device' ? 'This device' : 'Your account'}</span>
      </header>
      {intro && <p className="muted small">{intro}</p>}
      {children}
    </section>
  )
}

/** Keuze uit een paar opties als knoppenrij. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly [T, string][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="settings-toggle">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {children}
      </label>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  )
}

const THEMES: readonly [ThemeChoice, string][] = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['system', 'Automatic'],
]
const SCAN_MODES: readonly [ScanModePref, string][] = [
  ['queue', 'Quick scan'],
  ['single', 'Single card'],
  ['multi', 'Binder page'],
]

function AppearanceSection(): JSX.Element {
  const prefs = usePrefs()
  const motionPref = useMotionPreference()
  const motion = useMotion()
  return (
    <Section title="Appearance" scope="device">
      <Choice label="Theme" value={prefs.theme} options={THEMES} onChange={(v) => setPref('theme', v)} />
      <Toggle
        checked={motionPref}
        onChange={setMotionPreference}
        hint={motionPref && !motion ? 'Your device is set to reduce motion, so animations stay off.' : undefined}
      >
        Animations: holo effects, celebrations and visiting Pokémon
      </Toggle>
      <Toggle checked={prefs.sky} onChange={(v) => setPref('sky', v)} hint={prefs.sky && !motion ? 'With animations off you see a still starry sky.' : undefined}>
        Living background: stars, falling stars, Team Rocket and more
      </Toggle>
      <Toggle checked={prefs.wallpaper} onChange={(v) => setPref('wallpaper', v)}>
        Energy wallpaper: faint type symbols behind the page
      </Toggle>
    </Section>
  )
}

function PartnerSection(): JSX.Element {
  const choice = usePartnerChoice()
  const partner = usePartner()
  const [open, setOpen] = useState(false)
  return (
    <Section title="Partner Pokémon" scope="device" intro="Your partner walks with you through the app and cheers when you add cards.">
      <div className="partner-current">
        <img src={spriteUrls(partner.dex, false)[1]} alt="" width={64} height={64} />
        <div>
          <strong>{partner.name}</strong>
          <p className="muted small">{choice === null ? 'Automatic: the Pokémon you have the most cards of.' : 'Chosen by you.'}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
        <div className="partner-picker" role="group" aria-label="Choose your partner">
          <button type="button" aria-pressed={choice === null} onClick={() => setPartnerChoice(null)} className="partner-option">
            <span className="partner-auto" aria-hidden="true">
              ★
            </span>
            <span>Automatic</span>
          </button>
          {STARTERS.map((s) => (
            <button key={s.dex} type="button" aria-pressed={choice?.dex === s.dex} onClick={() => setPartnerChoice({ dex: s.dex, name: s.name })} className="partner-option">
              <img src={spriteUrls(s.dex, false)[1]} alt="" width={56} height={56} loading="lazy" />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </Section>
  )
}

function ScanningSection(): JSX.Element {
  const prefs = usePrefs()
  return (
    <Section title="Scanning" scope="device">
      <Choice label="Open the scanner in" value={prefs.scanMode} options={SCAN_MODES} onChange={(v) => setPref('scanMode', v)} />
      <Toggle checked={prefs.autoCapture} onChange={(v) => setPref('autoCapture', v)} hint="Quick scan takes the photo itself when a new card lies still in the frame. You can also switch it in the camera.">
        Auto capture
      </Toggle>
      <Choice
        label="Time between auto photos"
        value={String(prefs.autoGapMs)}
        options={AUTO_GAPS.map((g) => [String(g), `${(g / 1000).toLocaleString('en-GB')} s`] as [string, string])}
        onChange={(v) => setPref('autoGapMs', Number(v) as AutoGap)}
      />
      <Toggle checked={prefs.blurCheck} onChange={(v) => setPref('blurCheck', v)} hint="Clearly blurry camera photos are not sent; you can still choose to use them.">
        Hold back blurry photos
      </Toggle>
    </Section>
  )
}

// --- Instellingen in je account (Supabase), automatisch bewaard ---

type Form = { pct: Record<Condition, string>; fee: string; cost: string; defaults: NewCardDefaults }

const numText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n))

function toForm(s: UserSettings): Form {
  const pct = Object.fromEntries((Object.keys(CONDITION_LABELS) as Condition[]).map((c) => [c, numText(s.conditionPct[c])])) as Record<Condition, string>
  return { pct, fee: numText(s.saleFeePct), cost: numText(s.saleCostPerSale), defaults: s.defaults }
}

/** Leeg = niet ingesteld; anders een getal binnen de grenzen. */
function parseNumber(raw: string, min: number, max: number): number | null | 'invalid' {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= min && n <= max ? n : 'invalid'
}

/** Gangbare verhoudingen t.o.v. de Cardmarket-prijs; aan te passen. */
const SUGGESTED_PCT: Record<Condition, string> = { MT: '100', NM: '100', EX: '85', GD: '70', LP: '60', PL: '45', PO: '30' }

function validate(form: Form): { settings: UserSettings } | { error: string } {
  const pct: Partial<Record<Condition, number>> = {}
  for (const c of Object.keys(CONDITION_LABELS) as Condition[]) {
    const v = parseNumber(form.pct[c], 0, 200)
    if (v === 'invalid') return { error: `${CONDITION_LABELS[c]}: enter a percentage from 0 to 200, or leave it empty.` }
    if (v !== null) pct[c] = v
  }
  const fee = parseNumber(form.fee, 0, 99)
  const cost = parseNumber(form.cost, 0, 10000)
  if (fee === 'invalid' || cost === 'invalid') return { error: 'Enter fees as 0 to 99 % and costs per sale as an amount, or leave them empty.' }
  return { settings: { conditionPct: pct, saleFeePct: fee, saleCostPerSale: cost, defaults: { ...form.defaults, set_code: form.defaults.set_code?.trim().slice(0, 20) || null } } }
}

const SAVE_DELAY_MS = 700

function AccountSettings(): JSX.Element {
  const enabled = useDbFeature(hasValuations)
  const [form, setForm] = useState<Form | null>(null)
  const [status, setStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null)
  const [edited, setEdited] = useState(false)

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    loadSettings()
      .then((s) => {
        if (!cancelled) setForm(toForm(s))
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Loading settings failed.' })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  // Automatisch bewaren, kort na de laatste wijziging.
  useEffect(() => {
    if (!form || !edited) return
    const result = validate(form)
    if ('error' in result) return
    const timer = window.setTimeout(() => {
      setStatus({ kind: 'saving', text: 'Saving…' })
      saveSettings(result.settings)
        .then(() => setStatus({ kind: 'saved', text: 'Saved' }))
        .catch((err: unknown) => setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Saving failed.' }))
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [form, edited])

  const edit = (fn: (f: Form) => Form): void => {
    setEdited(true)
    setForm((f) => (f ? fn(f) : f))
  }
  const setDefault = <K extends keyof NewCardDefaults>(key: K, value: NewCardDefaults[K]): void => edit((f) => ({ ...f, defaults: { ...f.defaults, [key]: value } }))

  if (enabled === false) return <p className="notice">Account settings are not set up yet (run STAP7 in Supabase).</p>
  if (!form) return status?.kind === 'error' ? <p className="error" role="alert">{status.text}</p> : <Loading />

  // Ongeldige invoer: melden en niet bewaren.
  const checked = validate(form)
  const shown = edited && 'error' in checked ? { kind: 'error' as const, text: checked.error } : status
  const saveState = shown && (
    <p className={`settings-save is-${shown.kind}`} role={shown.kind === 'error' ? 'alert' : 'status'}>
      {shown.text}
    </p>
  )

  return (
    <>
      <Section title="New cards" scope="account" intro="Filled in when you add or scan a card; you can still change them per card.">
        <div className="form-grid">
          <label>
            Language
            <select value={form.defaults.language ?? ''} onChange={(e) => setDefault('language', (e.target.value || null) as CardLanguage | null)}>
              <option value="">No default</option>
              {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={form.defaults.condition ?? ''} onChange={(e) => setDefault('condition', (e.target.value || null) as Condition | null)}>
              <option value="">No default</option>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Set
            <input value={form.defaults.set_code ?? ''} maxLength={20} placeholder="e.g. MEW" onChange={(e) => setDefault('set_code', e.target.value || null)} />
          </label>
        </div>
        {saveState}
      </Section>

      <Section
        title="Value estimates"
        scope="account"
        intro="Cardmarket prices are averages over all conditions. With these percentages the app also shows an estimate for your copy's condition and what you would receive when selling. Empty = no estimate."
      >
        <div className="settings-subhead">
          <h3>Value by condition</h3>
          <button type="button" className="small-btn" onClick={() => edit((f) => ({ ...f, pct: { ...SUGGESTED_PCT } }))}>
            Use suggested values
          </button>
        </div>
        <div className="form-grid">
          {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
            <label key={c}>
              {CONDITION_LABELS[c]} (%)
              <input inputMode="decimal" value={form.pct[c]} placeholder="not set" onChange={(e) => edit((f) => ({ ...f, pct: { ...f.pct, [c]: e.target.value } }))} />
            </label>
          ))}
        </div>
        <h3 className="settings-subtitle">Selling costs</h3>
        <div className="form-grid">
          <label>
            Platform and payment fees (%)
            <input inputMode="decimal" value={form.fee} placeholder="not set" onChange={(e) => edit((f) => ({ ...f, fee: e.target.value }))} />
          </label>
          <label>
            Costs per sale (€)
            <input inputMode="decimal" value={form.cost} placeholder="not set" onChange={(e) => edit((f) => ({ ...f, cost: e.target.value }))} />
          </label>
        </div>
        {saveState}
      </Section>
    </>
  )
}

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

function AccountSection(): JSX.Element {
  const [email, setEmail] = useState<string | null>(null)
  const [pw, setPw] = useState({ next: '', again: '' })
  const [pwState, setPwState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [update, setUpdate] = useState<string | null>(null)

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
      setPwState({ ok: false, text: err instanceof Error ? `Changing the password failed: ${err.message}` : 'Changing the password failed.' })
    } finally {
      setPwBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Uitloggen mislukt', error)
  }

  async function lookForUpdate(): Promise<void> {
    setUpdate('Checking…')
    try {
      const r = await checkForUpdate()
      setUpdate(r === 'updating' ? 'A new version is loading…' : r === 'latest' ? 'You have the latest version.' : 'Updates are not available here.')
    } catch (err) {
      setUpdate(err instanceof Error ? `Checking failed: ${err.message}` : 'Checking failed.')
    }
  }

  const built = new Date(__APP_BUILD__)
  return (
    <Section title="Account and data" scope="account">
      <div className="settings-row">
        <span className="settings-label">Signed in as</span>
        <strong className="settings-value">{email ?? '…'}</strong>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <form className="settings-password" onSubmit={(e) => void changePassword(e)} noValidate>
        <h3 className="settings-subtitle">Change password</h3>
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

      <h3 className="settings-subtitle">Data</h3>
      <div className="settings-actions">
        <a className="button-link" href="#/backup">
          Backup and restore
        </a>
        <a className="button-link" href="#/import">
          Import
        </a>
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

      <h3 className="settings-subtitle">App</h3>
      <div className="settings-actions">
        <span className="muted small">Version of {Number.isNaN(built.getTime()) ? 'unknown date' : built.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <button type="button" onClick={() => void lookForUpdate()}>
          Check for updates
        </button>
        {update && (
          <span className="small" role="status">
            {update}
          </span>
        )}
      </div>
    </Section>
  )
}

const RESET_WORD = 'RESET'

/** Account helemaal leegmaken om opnieuw te beginnen; je login blijft. */
function ResetSection(): JSX.Element {
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
      setState({ ok: false, text: err instanceof Error ? err.message : 'Resetting failed. Nothing was deleted.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Reset account" scope="account">
      <div className="settings-danger">
        <p>
          Start over from scratch. This permanently deletes <strong>all your cards, photos, sales and purchases, wishlist, goals, scan history and your Crate</strong> (points,
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

export function SettingsPage(): JSX.Element {
  return (
    <section className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Changes are saved straight away: some on this device, some in your account.</p>
        </div>
      </div>
      <AppearanceSection />
      <PartnerSection />
      <ScanningSection />
      <AccountSettings />
      <AccountSection />
      <ResetSection />
    </section>
  )
}
