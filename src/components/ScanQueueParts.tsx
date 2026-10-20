import type { JSX } from 'react'
import type { Candidate } from '../lib/match'
import { MAX_QTY, stripCandidates, type QueueItem } from '../lib/scanQueue'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { IconMinus, IconPlus } from './Icons'
import { Sheet } from './Sheet'

/** Waarde van de keuzelijst "More…" zolang je er niets uit kiest. */
const MORE = '__more'

/**
 * Kaart kiezen door op een foto te tikken (audit S3, 20-10-2026): sneller en beter te herkennen dan een keuzelijst
 * met (Chinese) namen. "No link" voegt toe zonder koppeling; "More…" toont alle kandidaten.
 */
export function CandidateStrip({ candidates, chosen, label, onChoose }: { candidates: readonly Candidate[]; chosen: string; label: string; onChoose: (key: string) => void }): JSX.Element {
  const shown = stripCandidates(candidates, chosen)
  return (
    <div className="queue-pick" role="group" aria-label={`Card for ${label}`}>
      {shown.map((c) => (
        <button
          key={c.key}
          type="button"
          className="queue-cand"
          aria-pressed={c.key === chosen}
          onClick={() => onChoose(c.key)}
          aria-label={`${c.name}, ${c.setName} #${c.localId}`}
          title={`${c.name}, ${c.setName} #${c.localId}${c.reason ? ` (${c.reason})` : ''}`}
        >
          <CatalogKeyPicture cardKey={c.key} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={`#${c.localId}`} />} />
          {/* Set eronder: kandidaten hebben vaak dezelfde naam en hetzelfde nummer in verschillende sets. */}
          <span className="queue-cand-set">{c.setId}</span>
        </button>
      ))}
      <div className="queue-pick-other">
        <button type="button" className="queue-nolink small-btn" aria-pressed={chosen === ''} onClick={() => onChoose('')}>
          No link
        </button>
        {candidates.length > shown.length && (
          <select className="queue-more" aria-label={`All matches for ${label}`} value={MORE} onChange={(e) => e.target.value !== MORE && onChoose(e.target.value)}>
            <option value={MORE} disabled hidden>
              More…
            </option>
            {candidates.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}, {c.setName} #{c.localId}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

/** Aantal met − en +; typen kan ook (bv. 20 dezelfde kaarten). */
export function QtyStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }): JSX.Element {
  const set = (n: number): void => onChange(Math.min(MAX_QTY, Math.max(1, n)))
  return (
    <div className="qty-stepper" role="group" aria-label={label}>
      <button type="button" className="ghost icon-btn" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="One less">
        <IconMinus size={16} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QTY}
        value={value}
        aria-label="Quantity"
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          if (Number.isInteger(n)) set(n)
        }}
      />
      <button type="button" className="ghost icon-btn" onClick={() => set(value + 1)} disabled={value >= MAX_QTY} aria-label="One more">
        <IconPlus size={16} />
      </button>
    </div>
  )
}

/** Jouw foto en de gekozen kaart groot naast elkaar, om de match te controleren (audit S2). */
export function ComparePhotos({ item, candidate, label, onClose }: { item: QueueItem; candidate: Candidate | null; label: string; onClose: () => void }): JSX.Element {
  return (
    <Sheet title={label} onClose={onClose}>
      <div className="queue-compare">
        <figure>
          <img src={item.thumb} alt="Your photo" />
          <figcaption className="muted small">Your photo</figcaption>
        </figure>
        <figure>
          {candidate ? (
            <CatalogKeyPicture
              cardKey={candidate.key}
              image={candidate.image}
              name={candidate.name}
              quality="high"
              alt={`${candidate.name}, ${candidate.setName} #${candidate.localId}`}
              fallback={<CardFace name={candidate.name} detail={`${candidate.setName} #${candidate.localId}`} />}
            />
          ) : (
            <CardFace name={label} detail="Not linked" />
          )}
          <figcaption className="muted small">{candidate ? `${candidate.name} · ${candidate.setName} #${candidate.localId}` : 'Added without link'}</figcaption>
        </figure>
      </div>
    </Sheet>
  )
}
