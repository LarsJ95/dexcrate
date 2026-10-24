import { useEffect, useState, type JSX } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { CONDITION_LABELS, LANGUAGE_LABELS, type CardLanguage, type Condition } from '../lib/types'
import type { NewCardDefaults, UserSettings } from '../lib/valuation'
import { hasValuations, loadSettings, saveSettings } from '../lib/valuationDb'
import { Loading } from './Loading'
import { Group, More, Row } from './SettingsControls'
import { errorText } from '../lib/errors'

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

export function AccountSettings(): JSX.Element {
  const enabled = useDbFeature(hasValuations, 'valuations')
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
        if (!cancelled) setStatus({ kind: 'error', text: errorText(err, 'Loading settings failed.') })
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
        .catch((err: unknown) => setStatus({ kind: 'error', text: errorText(err, 'Saving failed.') }))
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [form, edited])

  const edit = (fn: (f: Form) => Form): void => {
    setEdited(true)
    setForm((f) => (f ? fn(f) : f))
  }
  const setDefault = <K extends keyof NewCardDefaults>(key: K, value: NewCardDefaults[K]): void => edit((f) => ({ ...f, defaults: { ...f.defaults, [key]: value } }))

  if (enabled === false) return <p className="notice">Account settings are not available yet.</p>
  if (!form) return status?.kind === 'error' ? <p className="error" role="alert">{status.text}</p> : <Loading />

  // Ongeldige invoer: melden en niet bewaren.
  const checked = validate(form)
  const shown = edited && 'error' in checked ? { kind: 'error' as const, text: checked.error } : status
  const saveState = shown && (
    <p className={`settings-save is-${shown.kind}`} role={shown.kind === 'error' ? 'alert' : 'status'}>
      {shown.text}
    </p>
  )

  const pctSet = Object.values(form.pct).some((v) => v.trim() !== '')
  const costsSet = form.fee.trim() !== '' || form.cost.trim() !== ''
  return (
    <Group title="New cards" foot={saveState}>
      <Row label="Language">
        <select aria-label="Default language" value={form.defaults.language ?? ''} onChange={(e) => setDefault('language', (e.target.value || null) as CardLanguage | null)}>
          <option value="">No default</option>
          {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Condition">
        <select aria-label="Default condition" value={form.defaults.condition ?? ''} onChange={(e) => setDefault('condition', (e.target.value || null) as Condition | null)}>
          <option value="">No default</option>
          {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Set">
        <input aria-label="Default set" value={form.defaults.set_code ?? ''} maxLength={20} placeholder="e.g. MEW" onChange={(e) => setDefault('set_code', e.target.value || null)} />
      </Row>
      <More label="Value by condition" detail={pctSet ? 'On' : 'Off'}>
        <p className="muted small">Share of the Cardmarket price per condition. Empty = no estimate.</p>
        <div className="form-grid settings-pct">
          {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
            <label key={c}>
              {CONDITION_LABELS[c]} (%)
              <input inputMode="decimal" value={form.pct[c]} placeholder="–" onChange={(e) => edit((f) => ({ ...f, pct: { ...f.pct, [c]: e.target.value } }))} />
            </label>
          ))}
        </div>
        <div className="settings-actions">
          <button type="button" className="small-btn" onClick={() => edit((f) => ({ ...f, pct: { ...SUGGESTED_PCT } }))}>
            Use suggested values
          </button>
        </div>
      </More>
      <More label="Selling costs" detail={costsSet ? 'On' : 'Off'}>
        <p className="muted small">Used to show what you would receive when selling.</p>
        <div className="form-grid">
          <label>
            Fees (%)
            <input inputMode="decimal" value={form.fee} placeholder="–" onChange={(e) => edit((f) => ({ ...f, fee: e.target.value }))} />
          </label>
          <label>
            Costs per sale (€)
            <input inputMode="decimal" value={form.cost} placeholder="–" onChange={(e) => edit((f) => ({ ...f, cost: e.target.value }))} />
          </label>
        </div>
      </More>
    </Group>
  )
}
