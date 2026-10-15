import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { CONDITION_LABELS, type Condition } from '../lib/types'
import type { UserSettings } from '../lib/valuation'
import { hasValuations, loadSettings, saveSettings } from '../lib/valuationDb'

type Form = { pct: Record<Condition, string>; fee: string; cost: string }

const numText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n))

function toForm(s: UserSettings): Form {
  const pct = Object.fromEntries((Object.keys(CONDITION_LABELS) as Condition[]).map((c) => [c, numText(s.conditionPct[c])])) as Record<Condition, string>
  return { pct, fee: numText(s.saleFeePct), cost: numText(s.saleCostPerSale) }
}

/** Leeg = niet ingesteld; anders een getal binnen de grenzen. */
function parseNumber(raw: string, min: number, max: number): number | null | 'invalid' {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= min && n <= max ? n : 'invalid'
}

/** Eigen instellingen voor schattingen: conditiecorrectie en verkoopkosten. Zonder invulling geen schatting. */
export function SettingsPage(): JSX.Element {
  const enabled = useDbFeature(hasValuations)
  const [form, setForm] = useState<Form | null>(null)
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
      await saveSettings({ conditionPct: pct, saleFeePct: fee, saleCostPerSale: cost })
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

      {!form && !message && <p aria-live="polite">Loading…</p>}
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
