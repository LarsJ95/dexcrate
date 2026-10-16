import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { useLocations } from '../hooks/useLocations'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { CONDITION_LABELS, LANGUAGE_LABELS, type CardLanguage, type Condition } from '../lib/types'
import type { NewCardDefaults, UserSettings } from '../lib/valuation'
import { hasValuations, loadSettings, saveSettings } from '../lib/valuationDb'
import { setMotionPreference, useMotion, useMotionPreference } from '../lib/motion'
import { STARTERS, setPartnerChoice, usePartnerChoice } from '../lib/partner'
import { spriteUrls } from '../lib/runner'
import { Loading } from '../components/Loading'

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

/** Animaties aan/uit, per apparaat (DESIGN.md §9). */
function MotionSetting(): JSX.Element {
  const preference = useMotionPreference()
  const allowed = useMotion()
  return (
    <fieldset className="form-group panel">
      <legend>Animations</legend>
      <label className="check">
        <input type="checkbox" checked={preference} onChange={(e) => setMotionPreference(e.target.checked)} />
        Holo effects, celebrations and visiting Pokémon
      </label>
      <p className="muted small">
        {preference && !allowed ? 'Your device is set to reduce motion, so animations stay off.' : 'Saved on this device only.'}
      </p>
    </fieldset>
  )
}

/** Partner kiezen: een starter, of automatisch (de Pokémon waar je de meeste kaarten van hebt). */
function PartnerSetting(): JSX.Element {
  const choice = usePartnerChoice()
  return (
    <fieldset className="form-group panel">
      <legend>Partner Pokémon</legend>
      <p className="muted small">Your partner walks with you through the app and cheers when you add cards. Saved on this device only.</p>
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
    </fieldset>
  )
}

/** Eigen instellingen voor schattingen: conditiecorrectie en verkoopkosten. Zonder invulling geen schatting. */
export function SettingsPage(): JSX.Element {
  const enabled = useDbFeature(hasValuations)
  const [form, setForm] = useState<Form | null>(null)
  const locations = useLocations(useSchemaV2() === true)
  const setDefault = <K extends keyof NewCardDefaults>(key: K, value: NewCardDefaults[K]): void =>
    setForm((f) => (f ? { ...f, defaults: { ...f.defaults, [key]: value } } : f))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    loadSettings()
      .then((s) => {
        if (!cancelled) setForm(toForm(s))
      })
      .catch((err: unknown) => {
        if (!cancelled) setMessage({ ok: false, text: err instanceof Error ? err.message : 'Loading settings failed.' })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!form || busy) return
    const pct: Partial<Record<Condition, number>> = {}
    for (const c of Object.keys(CONDITION_LABELS) as Condition[]) {
      const v = parseNumber(form.pct[c], 0, 200)
      if (v === 'invalid') {
        setMessage({ ok: false, text: `${CONDITION_LABELS[c]}: enter a percentage from 0 to 200, or leave it empty.` })
        return
      }
      if (v !== null) pct[c] = v
    }
    const fee = parseNumber(form.fee, 0, 99)
    const cost = parseNumber(form.cost, 0, 10000)
    if (fee === 'invalid' || cost === 'invalid') {
      setMessage({ ok: false, text: 'Enter fees as 0 to 99 % and costs per sale as an amount, or leave them empty.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await saveSettings({ conditionPct: pct, saleFeePct: fee, saleCostPerSale: cost, defaults: { ...form.defaults, set_code: form.defaults.set_code?.trim().slice(0, 20) || null } })
      setMessage({ ok: true, text: 'Settings saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Saving failed.' })
    } finally {
      setBusy(false)
    }
  }

  if (enabled === false) {
    return (
      <section className="page">
        <h1>Settings</h1>
        <MotionSetting />
        <PartnerSetting />
        <p className="notice">Settings are not set up yet (run STAP7 in Supabase).</p>
      </section>
    )
  }

  return (
    <section className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Used only for estimates. Empty fields mean no estimate is shown.</p>
        </div>
      </div>

      <MotionSetting />
      <PartnerSetting />
      {!form && !message && <Loading />}
      {form && (
        <form className="card-form panel" onSubmit={onSubmit} noValidate>
          <fieldset className="form-group">
            <legend>Value by condition</legend>
            <p className="muted small">Percentage of the Cardmarket price for a copy in this condition. Shown as an estimate, never as a market price.</p>
            <div className="form-grid">
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                <label key={c}>
                  {CONDITION_LABELS[c]} (%)
                  <input
                    inputMode="decimal"
                    value={form.pct[c]}
                    placeholder="not set"
                    onChange={(e) => setForm((f) => (f ? { ...f, pct: { ...f.pct, [c]: e.target.value } } : f))}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>Selling costs</legend>
            <p className="muted small">For the estimated amount you would receive if you sold each card separately.</p>
            <div className="form-grid">
              <label>
                Platform and payment fees (%)
                <input inputMode="decimal" value={form.fee} placeholder="not set" onChange={(e) => setForm((f) => (f ? { ...f, fee: e.target.value } : f))} />
              </label>
              <label>
                Costs per sale (€)
                <input inputMode="decimal" value={form.cost} placeholder="not set" onChange={(e) => setForm((f) => (f ? { ...f, cost: e.target.value } : f))} />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>Defaults for new cards</legend>
            <p className="muted small">Filled in when you add or scan a card; you can still change them per card.</p>
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
              {locations.length > 0 && (
                <label>
                  Location
                  <select value={form.defaults.location_id ?? ''} onChange={(e) => setDefault('location_id', e.target.value || null)}>
                    <option value="">No default</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </fieldset>

          {message && (
            <p className={message.ok ? 'success' : 'error'} role={message.ok ? 'status' : 'alert'}>
              {message.text}
            </p>
          )}

          <footer className="sheet-foot">
            <span className="spacer" />
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </footer>
        </form>
      )}
      {!form && message && (
        <p className="error" role="alert">
          {message.text}
        </p>
      )}
    </section>
  )
}
