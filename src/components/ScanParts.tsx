import { useState, type FormEvent, type JSX } from 'react'
import { errorText } from '../lib/errors'
import { autoPick, type Candidate } from '../lib/match'
import { correctRecognition, type Recognition } from '../lib/scan'
import type { ScanItem, ScanSession } from '../lib/scanSessions'
import { LANGUAGE_LABELS, type CardLanguage } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { LazyCardPrice } from './LazyCardPrice'

/** Lopende scansessie (bewaard), of anders wat je net hebt toegevoegd. */
export function ScanSessionSummary({ session, added, onEnd }: { session: ScanSession | null; added: readonly string[]; onEnd: () => void }): JSX.Element | null {
  if (session && session.items.length > 0) {
    return (
      <div className="panel scan-session">
        <div className="sheet-foot">
          <span className="stat-label">
            This session: {session.items.reduce((n, i) => n + i.quantity, 0)} cards, saved
          </span>
          <span className="spacer" />
          <button type="button" className="ghost small-btn" onClick={onEnd}>
            End session
          </button>
        </div>
        <p className="small">
          {session.items
            .slice(-8)
            .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name}`)
            .join(', ')}
          {session.items.length > 8 ? ` and ${session.items.length - 8} more` : ''}
        </p>
      </div>
    )
  }
  if (added.length === 0) return null
  return (
    <p className="success" role="status">
      Added: {added.join(', ')}
    </p>
  )
}

const isCardLanguage = (v: string): v is CardLanguage => Object.hasOwn(LANGUAGE_LABELS, v)

/** Marktprijs alleen bij de bovenste kandidaten: elk is een apart verzoek. */
const PRICED_CANDIDATES = 3

interface ReadFixProps {
  recognition: Recognition
  /** Zoekt opnieuw in de catalogus; een fout (bv. geen internet) wordt hier getoond. */
  onSearch: (r: Recognition) => Promise<void>
  onCancel: () => void
}

/** Gelezen naam, set, nummer en taal zelf verbeteren en opnieuw zoeken, zonder nieuwe foto of scan. */
export function ReadFixForm({ recognition, onSearch, onCancel }: ReadFixProps): JSX.Element {
  const [name, setName] = useState(recognition.nameEnglish || recognition.namePrinted)
  const [setCode, setSetCode] = useState(recognition.setCode)
  const [cardNumber, setCardNumber] = useState(recognition.cardNumber)
  const [setTotal, setSetTotal] = useState(recognition.setTotal)
  const [language, setLanguage] = useState<CardLanguage | ''>(recognition.language ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSearch(correctRecognition(recognition, { name, setCode, cardNumber, setTotal, language: language || null }))
    } catch (err) {
      setError(errorText(err, 'Searching failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="read-fix" onSubmit={(e) => void submit(e)} aria-label="Correct what was read">
      <div className="form-grid">
        <label className="wide">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" />
        </label>
        <label>
          Set code
          <input value={setCode} onChange={(e) => setSetCode(e.target.value)} maxLength={20} autoCapitalize="characters" autoComplete="off" />
        </label>
        <label>
          Number
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} maxLength={30} autoComplete="off" />
        </label>
        <label>
          Of
          <input value={setTotal} onChange={(e) => setSetTotal(e.target.value)} maxLength={10} inputMode="numeric" autoComplete="off" />
        </label>
        <label className="wide">
          Language
          <select value={language} onChange={(e) => setLanguage(isCardLanguage(e.target.value) ? e.target.value : '')}>
            <option value="">Unknown</option>
            {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((k) => (
              <option key={k} value={k}>
                {LANGUAGE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-foot">
        <button type="submit" className="primary" disabled={busy || !name.trim()}>
          {busy ? 'Searching…' : 'Search again'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}

interface SingleProps {
  recognition: Recognition
  candidates: readonly Candidate[]
  ownedByKey: ReadonlyMap<string, number>
  /** Deze kaart is eerder in de sessie toegevoegd: eerst vragen. */
  earlier: ScanItem | null
  /** null = toevoegen zonder koppeling. */
  onChoose: (candidate: Candidate | null) => void
  onAddAnotherCopy: () => void
  onReset: () => void
  /** Opnieuw zoeken met gecorrigeerde gelezen waarden. */
  onSearch: (r: Recognition) => Promise<void>
}

/** Resultaat van een losse scan: wat herkend is en de kandidaten om uit te kiezen. */
export function SingleScanResult({ recognition, candidates, ownedByKey, earlier, onChoose, onAddAnotherCopy, onReset, onSearch }: SingleProps): JSX.Element {
  const best = autoPick(candidates)
  const [fixing, setFixing] = useState(false)
  return (
    <div className="scan-result">
      <div className="panel">
        <div className="sheet-foot">
          <span className="stat-label">Recognised</span>
          <span className="spacer" />
          {!fixing && (
            <button type="button" className="ghost small-btn" onClick={() => setFixing(true)}>
              Correct
            </button>
          )}
        </div>
        <p className="scan-name">{recognition.nameEnglish || recognition.namePrinted}</p>
        <p className="muted small">
          {[
            recognition.setCode,
            recognition.cardNumber && `${recognition.cardNumber}${recognition.setTotal ? `/${recognition.setTotal}` : ''}`,
            recognition.language ? LANGUAGE_LABELS[recognition.language] : null,
          ]
            .filter(Boolean)
            .join(', ')}
          {recognition.confidence !== 'high' && ' (uncertain, please check)'}
        </p>
        {recognition.notes && <p className="muted small">{recognition.notes}</p>}
        {fixing && (
          <ReadFixForm
            recognition={recognition}
            onSearch={async (r) => {
              await onSearch(r)
              setFixing(false)
            }}
            onCancel={() => setFixing(false)}
          />
        )}
      </div>

      {earlier && (
        <div className="notice" role="alert">
          <p>
            You already added {earlier.name}
            {earlier.card_number ? ` #${earlier.card_number}` : ''} in this session
            {earlier.at ? ` at ${new Date(earlier.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}. Is this another copy?
          </p>
          <div className="sheet-foot">
            <button type="button" className="primary" onClick={onAddAnotherCopy}>
              Add another copy
            </button>
            <button type="button" className="ghost" onClick={onReset}>
              Skip, it’s the same card
            </button>
          </div>
        </div>
      )}

      <h2>Pick the right card</h2>
      {candidates.length === 0 && <p className="muted">No match found. You can add it without a link.</p>}
      {candidates.length > 0 && !best && (
        <p className="muted">
          No card with number {recognition.cardNumber} in the catalog{recognition.setCode ? ` (set ${recognition.setCode} may be missing)` : ''}. These only share the name. None of them? Add it without link.
        </p>
      )}
      <ul className="candidates">
        {candidates.map((c, i) => {
          const owned = ownedByKey.get(c.key)
          return (
            <li key={c.key}>
              <button type="button" className={`candidate${c === best ? ' selected' : ''}`} onClick={() => onChoose(c)}>
                <CatalogKeyPicture
                  cardKey={c.key}
                  image={c.image}
                  name={c.name}
                  quality="low"
                  alt=""
                  fallback={<CardFace name={c.name} detail={`${c.setName} #${c.localId}`} />}
                />
                <span className="cand-name">{c.name}</span>
                <span className="muted small">
                  {c.setName} {c.localId}
                </span>
                {i < PRICED_CANDIDATES && <LazyCardPrice cardKey={c.key} className="cand-price small" withReverse />}
                <span className="cand-reason small">{c === best && !c.noCardData ? 'Best match' : c.reason}</span>
                {owned && <span className="small">Owned {owned}×</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="scan-foot">
        <button type="button" className="ghost" onClick={() => onChoose(null)}>
          Add without link
        </button>
        <button type="button" className="ghost" onClick={onReset}>
          Discard
        </button>
      </div>
    </div>
  )
}
