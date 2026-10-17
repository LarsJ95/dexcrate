import type { JSX } from 'react'
import type { Candidate } from '../lib/match'
import type { Recognition } from '../lib/scan'
import type { ScanItem, ScanSession } from '../lib/scanSessions'
import { LANGUAGE_LABELS } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'

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
}

/** Resultaat van een losse scan: wat herkend is en de kandidaten om uit te kiezen. */
export function SingleScanResult({ recognition, candidates, ownedByKey, earlier, onChoose, onAddAnotherCopy, onReset }: SingleProps): JSX.Element {
  return (
    <div className="scan-result">
      <div className="panel">
        <span className="stat-label">Recognised</span>
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
      <ul className="candidates">
        {candidates.map((c, i) => {
          const owned = ownedByKey.get(c.key)
          return (
            <li key={c.key}>
              <button type="button" className={`candidate${i === 0 ? ' selected' : ''}`} onClick={() => onChoose(c)}>
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
                <span className="cand-reason small">{i === 0 ? 'Best match' : c.reason}</span>
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
