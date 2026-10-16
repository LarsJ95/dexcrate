import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { celebrateAdded } from '../lib/celebrate'
import { insertCards } from '../lib/db'
import { draftFromScan } from '../lib/scan'
import { MAX_QTY, isCondition, summarize, type QueueItem } from '../lib/scanQueue'
import { canRetry, getFeedback, getQueue, removeItems, retry, subscribe, undoFeedback, updateItem } from '../lib/scanQueueStore'
import { lookupLang } from '../lib/tcgdex'
import { CONDITION_LABELS, EMPTY_CARD, LANGUAGE_LABELS, VARIANT_LABELS, type Card, type CardInput, type Condition, type Variant } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { IconClose } from './Icons'

const STATUS_TEXT: Record<QueueItem['status'], string> = {
  waiting: 'Waiting…',
  recognising: 'Recognising…',
  matching: 'Looking up…',
  ready: '',
  error: '',
}

function useScanQueue(): QueueItem[] {
  return useSyncExternalStore(subscribe, getQueue)
}

const FEEDBACK_MS = 4000

/** Wat de laatste foto opleverde, kort in beeld, met ongedaan maken. */
function ScanToast(): JSX.Element | null {
  const f = useSyncExternalStore(subscribe, getFeedback)
  const [hidden, setHidden] = useState(0)
  useEffect(() => {
    if (!f) return
    const t = window.setTimeout(() => setHidden(f.seq), FEEDBACK_MS)
    return () => window.clearTimeout(t)
  }, [f])
  if (!f || hidden === f.seq) return null
  return (
    <div className={`scan-toast${f.ok ? ' ok' : ' bad'}`} role="status">
      <span className="scan-toast-text">
        <span aria-hidden="true">{f.ok ? '✓ ' : '! '}</span>
        {f.text}
      </span>
      {f.undo && (
        <button type="button" className="small-btn" onClick={undoFeedback}>
          Undo
        </button>
      )}
      {f.keepAnyway && (
        <button
          type="button"
          className="small-btn"
          onClick={() => {
            f.keepAnyway?.()
            setHidden(f.seq)
          }}
        >
          Use anyway
        </button>
      )}
    </div>
  )
}

/** Strook onderin de camera: laatste foto's en hoeveel er klaar zijn. */
export function QueueStrip(): JSX.Element | null {
  const queue = useScanQueue()
  if (queue.length === 0) {
    return (
      <div className="queue-strip">
        <ScanToast />
        <p className="queue-strip-hint">Take a photo of each card. Recognition runs in the background.</p>
      </div>
    )
  }
  const s = summarize(queue)
  return (
    <div className="queue-strip" aria-live="polite">
      <ScanToast />
      <span className="queue-strip-count">
        {s.total} scanned{s.busy > 0 ? `, ${s.busy} working` : ''}
        {s.failed > 0 ? `, ${s.failed} failed` : ''}
      </span>
      <ol>
        {queue.slice(-6).map((q) => (
          <li key={q.id} className={`queue-thumb is-${q.status}`}>
            <img src={q.thumb} alt="" />
            {q.quantity > 1 && <span className="qty-badge">{q.quantity}×</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

interface Props {
  ownedByKey: ReadonlyMap<string, number>
  nextSortOrder: number
  defaultCondition: Condition | null
  onAdded: (rows: Card[]) => void
  /** Eén kaart in het gewone formulier openen; bij opslaan verdwijnt hij uit de wachtrij. */
  onEdit: (draft: Partial<CardInput>, queueId: string) => void
}

/** Wachtrij nakijken en in één keer toevoegen. */
export function ScanQueue({ ownedByKey, nextSortOrder, defaultCondition, onAdded, onEdit }: Props): JSX.Element | null {
  const queue = useScanQueue()
  const [condition, setCondition] = useState<Condition | ''>(defaultCondition ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  if (queue.length === 0) return null

  const s = summarize(queue)
  const selected = queue.filter((q) => q.status === 'ready' && q.include && q.rec)
  const candidateOf = (q: QueueItem) => q.candidates.find((c) => c.key === q.chosen) ?? null

  async function draftOf(q: QueueItem): Promise<Partial<CardInput>> {
    if (!q.rec) return {}
    const draft = await draftFromScan(q.rec, candidateOf(q), lookupLang(q.rec.language))
    return { ...draft, variant: q.variant, quantity: q.quantity, condition: condition || null }
  }

  async function addAll(): Promise<void> {
    if (busy || selected.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const inputs = await Promise.all(
        selected.map(async (q, i): Promise<CardInput> => {
          const draft = await draftOf(q)
          return { ...EMPTY_CARD, ...draft, name: (draft.name ?? '').slice(0, 200) || 'Unknown card', sort_order: nextSortOrder + i }
        }),
      )
      const rows = await insertCards(inputs)
      removeItems(selected.map((q) => q.id))
      onAdded(rows)
      void celebrateAdded(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adding failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="scan-result scan-queue" aria-labelledby="queue-title">
      <div className="catalog-head">
        <h2 id="queue-title">Your scans</h2>
        <span className="muted small">
          {s.total} {s.total === 1 ? 'card' : 'cards'}
          {s.busy > 0 ? `, ${s.busy} still working` : ''}
          {s.failed > 0 ? `, ${s.failed} failed` : ''}
        </span>
      </div>

      <ul className="binder-scan">
        {queue.map((q) => {
          const c = candidateOf(q)
          const label = q.rec ? q.rec.nameEnglish || q.rec.namePrinted || 'Unknown card' : STATUS_TEXT[q.status] || 'Photo'
          const owned = c ? ownedByKey.get(c.key) : undefined
          const ready = q.status === 'ready'
          return (
            <li key={q.id} className={`scan-row queue-row${ready && q.include ? ' on' : ''}${q.status === 'error' ? ' is-error' : ''}`}>
              <label className="scan-check">
                <input
                  type="checkbox"
                  checked={ready && q.include}
                  disabled={!ready}
                  onChange={(e) => updateItem(q.id, { include: e.target.checked })}
                  aria-label={`Add ${label}`}
                />
              </label>
              <span className="queue-photos">
                <img className="queue-own" src={q.thumb} alt="Your photo" />
                <span className="scan-thumb">
                  {c ? (
                    <CatalogKeyPicture cardKey={c.key} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={`${c.setName} #${c.localId}`} />} />
                  ) : (
                    <CardFace name={label} detail={q.rec ? [q.rec.setCode, q.rec.cardNumber].filter(Boolean).join(' ') : undefined} loading={!ready && q.status !== 'error'} />
                  )}
                </span>
              </span>
              <div className="scan-info">
                <p className="tile-name">{label}</p>
                {q.status === 'error' && <p className="error small">{q.error}</p>}
                {!ready && q.status !== 'error' && <p className="muted small">{STATUS_TEXT[q.status]}</p>}
                {q.rec && (
                  <p className="muted small">
                    Read: {[q.rec.setCode, q.rec.cardNumber, q.rec.language ? LANGUAGE_LABELS[q.rec.language] : null].filter(Boolean).join(', ') || 'unreadable'}
                    {q.rec.confidence !== 'high' && ' (uncertain)'}
                  </p>
                )}
                {ready && (
                  <div className="queue-fields">
                    <select aria-label={`Match for ${label}`} value={q.chosen} onChange={(e) => updateItem(q.id, { chosen: e.target.value })}>
                      {q.candidates.map((cand) => (
                        <option key={cand.key} value={cand.key}>
                          {cand.name}, {cand.setName} {cand.localId}
                        </option>
                      ))}
                      <option value="">Add without link</option>
                    </select>
                    <select aria-label={`Variant of ${label}`} value={q.variant ?? ''} onChange={(e) => updateItem(q.id, { variant: e.target.value ? (e.target.value as Variant) : null })}>
                      <option value="">Variant unknown</option>
                      {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
                        <option key={v} value={v}>
                          {VARIANT_LABELS[v]}
                        </option>
                      ))}
                    </select>
                    <label className="queue-qty">
                      Qty
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_QTY}
                        value={q.quantity}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10)
                          if (Number.isInteger(n)) updateItem(q.id, { quantity: Math.min(MAX_QTY, Math.max(1, n)) })
                        }}
                      />
                    </label>
                  </div>
                )}
                {owned && <p className="small">Owned {owned}×</p>}
              </div>
              <div className="queue-actions">
                {ready && (
                  <button type="button" className="ghost small-btn" onClick={() => void draftOf(q).then((d) => onEdit(d, q.id))}>
                    Edit
                  </button>
                )}
                {q.status === 'error' && canRetry(q.id) && (
                  <button type="button" className="ghost small-btn" onClick={() => retry(q.id)}>
                    Retry
                  </button>
                )}
                <button type="button" className="ghost icon-btn" onClick={() => removeItems([q.id])} aria-label={`Remove ${label}`}>
                  <IconClose size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="scan-bulk">
        <label>
          Condition
          <select value={condition} onChange={(e) => setCondition(isCondition(e.target.value) ? e.target.value : '')}>
            <option value="">Unknown</option>
            {(Object.keys(CONDITION_LABELS) as Condition[]).map((k) => (
              <option key={k} value={k}>
                {CONDITION_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void addAll()} disabled={busy || s.selected === 0}>
          {busy ? 'Adding…' : `Add ${s.selected} to collection`}
        </button>
        {confirmClear ? (
          <>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                removeItems(queue.map((q) => q.id))
                setConfirmClear(false)
              }}
            >
              Yes, clear all scans
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="ghost" onClick={() => setConfirmClear(true)} disabled={busy}>
            Clear
          </button>
        )}
      </div>
      {s.busy > 0 && <p className="muted small">You can keep scanning or leave this page; recognition continues while the app is open.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
