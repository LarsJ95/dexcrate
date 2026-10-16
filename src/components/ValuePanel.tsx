import { useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { useDbFeature } from '../hooks/useDbFeature'
import { useKeyed } from '../hooks/useKeyed'
import { moneyText, parseMoney, today } from '../lib/money'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getTcgplayerPrice, type CardmarketPrice } from '../lib/tcgdex'
import { CONDITION_LABELS, type Card } from '../lib/types'
import { EMPTY_SETTINGS, TCGP_KEY_LABELS, conditionEstimate, tcgplayerFor, type UserSettings } from '../lib/valuation'
import { addValuation, deleteValuation, hasValuations, listValuations, loadSettings, type Valuation } from '../lib/valuationDb'

interface Props {
  card: Card
  /** Cardmarket-prijs (al geladen door de kaartweergave); undefined = laden. */
  price: CardmarketPrice | null | undefined
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateText = (iso: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : day.format(d)
}

/** Uitleg achter een ⓘ, zodat de prijzen zelf compact blijven. */
function InfoTip({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <details className="info-tip">
      <summary aria-label={label} title={label}>
        i
      </summary>
      <span className="info-tip-text small">{children}</span>
    </details>
  )
}

const BASIS_LABELS = { trend: 'trend price', avg30: '30-day average (no trend price)', avg7: '7-day average (no trend or 30-day price)' } as const

/**
 * Waarde van één kaartregel per bron, met wat erbij hoort: bron, prijssoort, datum, valuta, uitvoering,
 * of conditie/grading overeenkomen en de kwaliteit van de koppeling. Ontbreekt een bron, dan staat dat er.
 */
export function ValuePanel({ card, price }: Props): JSX.Element | null {
  const tcgp = useKeyed(card.kind === 'card' ? card.tcgdex_id : null, getTcgplayerPrice)
  const enabled = useDbFeature(hasValuations) === true
  const [valuations, setValuations] = useState<Valuation[] | null>(null)
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS)
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all([listValuations(card.id), loadSettings()])
      .then(([v, s]) => {
        if (cancelled) return
        setValuations(v)
        setSettings(s)
      })
      .catch((err: unknown) => {
        console.warn('Waarderingen laden mislukt', err)
        if (!cancelled) setValuations([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, card.id])

  if (card.kind !== 'card' && !enabled) return null

  const cm = marketValue(price, card.variant)
  const tp = tcgplayerFor(tcgp ?? null, card.variant)
  const estimate = cm ? conditionEstimate(cm.value, card.condition, settings) : null
  const latest = valuations?.[0] ?? null

  async function onAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const a = parseMoney(amount, 'value')
    if ('error' in a || a.value === null) {
      setError('error' in a ? a.error : 'Enter a value.')
      return
    }
    if (!date) {
      setError('Enter a date.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const v = await addValuation({ card_id: card.id, amount: a.value, valued_on: date, note: note.trim().slice(0, 500) || null })
      setValuations((list) => [v, ...(list ?? [])].sort((x, y) => y.valued_on.localeCompare(x.valued_on)))
      setAdding(false)
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(v: Valuation): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await deleteValuation(v.id)
      setValuations((list) => list?.filter((x) => x.id !== v.id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deleting failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="value-panel" aria-labelledby={`value-${card.id}`}>
      <h3 id={`value-${card.id}`} className="panel-title">
        Prices per copy
      </h3>
      <dl className="value-list">
        {card.kind === 'card' && (
          <>
            <div>
              <dt>Cardmarket (EU)</dt>
              <dd>
                {price === undefined ? (
                  '…'
                ) : cm ? (
                  <span className="value-line">
                    <strong>{formatEur(cm.value)}</strong>
                    <InfoTip label="About the Cardmarket price">
                      {`The ${BASIS_LABELS[cm.basis]}${cm.reverse ? ' for reverse holo' : ''}${price?.updated && dateText(price.updated) ? `, updated ${dateText(price.updated)}` : ''}. Cardmarket averages all conditions (Poor to Mint); no Excellent+ price is published. The Cardmarket link opens with Excellent or better selected.`}
                      {card.grading_company ? ` For ungraded copies; yours is ${card.grading_company} ${card.grade ?? ''}.` : ''}
                    </InfoTip>
                  </span>
                ) : (
                  <span className="muted">
                    No price{card.variant === 'reverse' ? ' for reverse holo' : ''}
                    {!card.tcgdex_id ? ' (card not linked)' : ''}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>TCGplayer (US)</dt>
              <dd>
                {tcgp === undefined ? (
                  '…'
                ) : tp ? (
                  <span className="value-line">
                    <strong>{usd.format(tp.market)}</strong>
                    <InfoTip label="About the TCGplayer price">
                      {`${TCGP_KEY_LABELS[tp.key] ?? tp.key} market price in US dollars, not converted; not a European price.`}
                    </InfoTip>
                  </span>
                ) : (
                  <span className="muted">
                    {tcgp && !card.variant ? 'Set the variant to see the matching price' : 'No price'}
                  </span>
                )}
              </dd>
            </div>
          </>
        )}
        {estimate && card.condition && (
          <div>
            <dt>Estimate for {CONDITION_LABELS[card.condition]}</dt>
            <dd>
              <span className="value-line">
                <strong>{formatEur(estimate.value)}</strong>
                <InfoTip label="About this estimate">{`Estimate: ${estimate.pct}% of the Cardmarket price (your setting).`}</InfoTip>
              </span>
            </dd>
          </div>
        )}
        {enabled && (
          <div>
            <dt>Your valuation</dt>
            <dd>
              {valuations === null ? (
                '…'
              ) : latest ? (
                <>
                  <strong>{formatEur(latest.amount)}</strong>
                  <span className="muted small">
                    {dateText(latest.valued_on)}
                    {latest.note ? `: ${latest.note}` : ''}
                  </span>
                </>
              ) : (
                <span className="muted">None yet</span>
              )}
            </dd>
          </div>
        )}
      </dl>

      {enabled && valuations && valuations.length > 1 && (
        <details>
          <summary className="muted small">Earlier valuations</summary>
          <ul className="doc-list">
            {valuations.slice(1).map((v) => (
              <li key={v.id}>
                <span>
                  {formatEur(v.amount)}, {dateText(v.valued_on)}
                  {v.note ? `: ${v.note}` : ''}
                </span>
                <button type="button" className="ghost small-btn danger-text" onClick={() => void onDelete(v)} disabled={busy}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {enabled &&
        (adding ? (
          <form className="valuation-form" onSubmit={onAdd} noValidate>
            <div className="form-grid">
              <label>
                Value per copy (€)
                <input inputMode="decimal" value={amount} placeholder={cm ? moneyText(cm.value) : '0.00'} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <label>
              Note
              <input value={note} maxLength={500} placeholder="e.g. offer at a card fair" onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="sheet-foot">
              <button type="button" className="ghost" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save valuation'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="small-btn" onClick={() => setAdding(true)}>
            Add your valuation
          </button>
        ))}
      {!adding && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
