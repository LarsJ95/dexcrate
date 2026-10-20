import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { addedQuietly } from '../lib/celebrate'
import { insertCards } from '../lib/db'
import { autoPick } from '../lib/match'
import { draftFromScan } from '../lib/scan'
import { readLabel } from '../lib/scanResult'
import { recordChoices, type ChoiceInput } from '../lib/scanMemory'
import { isAmbiguous, isCondition, onlyOtherNumbers, reviewGroups, scannedTwice, summarize, withoutCardData, type QueueItem } from '../lib/scanQueue'
import {
  canLookAgain,
  canRetry,
  getFeedback,
  getQueue,
  getRemoved,
  lookAgain,
  removeItems,
  removeWithUndo,
  retry,
  searchAgain,
  subscribe,
  undoFeedback,
  undoRemove,
  updateItem,
} from '../lib/scanQueueStore'
import { lookupLang } from '../lib/tcgdex'
import { CONDITION_LABELS, EMPTY_CARD, type Card, type CardInput, type Condition } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { ChsCatalogNotice } from './ChsCatalogNotice'
import { IconClose } from './Icons'
import { LazyCardPrice } from './LazyCardPrice'
import { ReadFixForm } from './ScanParts'
import { CandidateStrip, ComparePhotos, QtyStepper } from './ScanQueueParts'
import { VariantGapNote, VariantSelect } from './VariantSelect'
import { errorText } from '../lib/errors'
import { useLoadMore } from '../hooks/useLoadMore'
import { Loading } from './Loading'

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

/** Moet je zelf de kaart kiezen? Dan staan de kandidaten meteen als foto's in beeld. */
const needsPick = (q: QueueItem): boolean => q.status === 'ready' && (!autoPick(q.candidates) || isAmbiguous(q) || withoutCardData(q))

/** Chinese kaart zonder zekere match: daar kan de Chinese catalogus helpen. */
const chineseUnsure = (q: QueueItem): boolean => q.status === 'ready' && (q.rec?.language === 'zh-cn' || q.rec?.language === 'zh-tw') && !autoPick(q.candidates)

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
  onEdit: (draft: Partial<CardInput>, queueId: string, choice: Omit<ChoiceInput, 'chosen'>) => void
  /** Kaart-sleutels op je wishlist. */
  wished: ReadonlySet<string>
}

/** Wachtrij nakijken en in één keer toevoegen. */
/** Zoveel gescande kaarten per keer tonen; meer zodra je bij het einde komt. */
const ROWS_PER_STEP = 30

export function ScanQueue({ ownedByKey, nextSortOrder, defaultCondition, onAdded, onEdit, wished }: Props): JSX.Element | null {
  const queue = useScanQueue()
  const [condition, setCondition] = useState<Condition | ''>(defaultCondition ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  /** Regel waarvan je de gelezen waarden aan het verbeteren bent. */
  const [fixingId, setFixingId] = useState<string | null>(null)
  /** "Look again" loopt voor deze regels; fouten per regel. */
  const [looking, setLooking] = useState<ReadonlySet<string>>(new Set())
  const [lookErrors, setLookErrors] = useState<ReadonlyMap<string, string>>(new Map())
  /** Regels met "More" open: kandidaten en Correct / Look again / Edit zichtbaar. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** Regel waarvan je je foto en de match groot vergelijkt. */
  const [comparing, setComparing] = useState<string | null>(null)
  const toggleExpanded = (id: string): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  // Lange lijst in stukken tonen (tot 250 foto's); groepen in volgorde: eerst wat je moet nakijken.
  const { count: shownCount, sentinel: moreRef } = useLoadMore(queue.length, 'scan-queue', ROWS_PER_STEP)
  const removedInfo = useSyncExternalStore(subscribe, getRemoved)
  /** Net weggehaald met ×: terughalen kan nog even (G1). */
  const undo = removedInfo && (
    <div className="queue-undo" role="status">
      <span>
        Removed {removedInfo.label}
        {removedInfo.count > 1 ? ` and ${removedInfo.count - 1} more` : ''}.
      </span>
      <button type="button" className="small-btn" onClick={undoRemove}>
        Undo
      </button>
    </div>
  )
  if (queue.length === 0) {
    if (undo) return <div className="scan-bulk queue-bulk">{undo}</div>
    return done ? (
      <p className="success" role="status">
        {done}
      </p>
    ) : null
  }

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
    setDone(null)
    try {
      const inputs = await Promise.all(
        selected.map(async (q, i): Promise<CardInput> => {
          const draft = await draftOf(q)
          return { ...EMPTY_CARD, ...draft, name: (draft.name ?? '').slice(0, 200) || 'Unknown card', sort_order: nextSortOrder + i }
        }),
      )
      const rows = await insertCards(inputs)
      const fromWishlist = selected.filter((q) => wished.has(q.chosen)).length
      const count = rows.reduce((n, r) => n + r.quantity, 0)
      setDone(`Added ${count} ${count === 1 ? 'card' : 'cards'}${fromWishlist > 0 ? `, ${fromWishlist} from your wishlist ★` : ''}.`)
      // Andere kaart dan de app voorstelde: onthouden (vóór het weghalen uit de lijst).
      void recordChoices(selected.map((q) => ({ rec: q.rec, candidates: q.candidates, chosen: q.chosen || null })))
      removeItems(selected.map((q) => q.id))
      onAdded(rows)
      void addedQuietly(rows)
    } catch (err) {
      setError(errorText(err, 'Adding failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function runLookAgain(id: string): Promise<void> {
    if (looking.has(id)) return
    setLooking((s) => new Set(s).add(id))
    setLookErrors((m) => {
      const next = new Map(m)
      next.delete(id)
      return next
    })
    try {
      await lookAgain(id)
    } catch (err) {
      setLookErrors((m) => new Map(m).set(id, errorText(err, 'Looking again failed.')))
    } finally {
      setLooking((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  /**
   * Eén gescande kaart, compact (audit S1–S3, 20-10-2026): kop met jouw foto en de match (tik = groot vergelijken),
   * naam, set, nummer en prijs op één regel. Alleen bij twijfel de kandidaten als foto's; uitvoering en aantal op één
   * rij; Correct / Look again / Edit achter "More".
   */
  const row = (q: QueueItem): JSX.Element => {
    const c = candidateOf(q)
    const label = q.rec ? q.rec.nameEnglish || q.rec.namePrinted || 'Unknown card' : STATUS_TEXT[q.status] || 'Photo'
    const owned = c ? ownedByKey.get(c.key) : undefined
    const ready = q.status === 'ready'
    const open = expanded.has(q.id)
    const fixing = ready && q.rec !== null && fixingId === q.id
    const showStrip = ready && !fixing && q.candidates.length > 0 && (needsPick(q) || open)
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
        <button type="button" className="queue-photos" onClick={() => setComparing(q.id)} aria-label={`Compare your photo of ${label} with the card`}>
          <img className="queue-own" src={q.thumb} alt="" />
          <span className="scan-thumb">
            {c ? (
              <CatalogKeyPicture cardKey={c.key} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={`#${c.localId}`} />} />
            ) : (
              <CardFace name={label} detail={q.rec?.cardNumber ? `#${q.rec.cardNumber}` : undefined} loading={!ready && q.status !== 'error'} />
            )}
          </span>
        </button>
        <div className="scan-info">
          <p className="tile-name">
            {c && wished.has(c.key) && (
              <span className="wish-star" title="On your wishlist">
                ★ <span className="visually-hidden">On your wishlist: </span>
              </span>
            )}
            {label}
          </p>
          {/* Bij twijfel zonder keuze zegt de knop "No link" in de strook al wat er gebeurt. */}
          {ready && (c || !showStrip) && (
            <p className="queue-meta small">
              {c ? (
                <>
                  <span>
                    {c.setName} #{c.localId}
                  </span>
                  <LazyCardPrice cardKey={c.key} className="scan-price" withReverse />
                </>
              ) : (
                <span>Without link</span>
              )}
              {owned && <span>Owned {owned}×</span>}
            </p>
          )}
          {q.status === 'error' && <p className="error small">{q.error}</p>}
          {!ready && q.status !== 'error' && <p className="muted small">{STATUS_TEXT[q.status]}</p>}
          {/* Wat de scan las alleen bij twijfel (S5): bij een zekere match zegt de kaart genoeg. */}
          {q.rec && (q.rec.confidence !== 'high' || needsPick(q)) && <p className="muted small">{readLabel(q.rec)}</p>}
        </div>
        <button type="button" className="ghost icon-btn queue-remove" onClick={() => removeWithUndo([q.id])} aria-label={`Remove ${label}`}>
          <IconClose size={16} />
        </button>
        {/* Waarom nakijken: over de volle breedte, dan past het meestal op één regel. */}
        {ready && (
          <div className="queue-wide queue-notes">
            {onlyOtherNumbers(q) && <p className="queue-why small">Not sure: tap the right card.</p>}
            {isAmbiguous(q) && !onlyOtherNumbers(q) && <p className="queue-why small">Same name and number in more sets: tap the right one.</p>}
            {withoutCardData(q) && <p className="queue-why small">No card data for this set: check the number.</p>}
            {twice.has(q.id) && <p className="queue-why small">Scanned twice. Same card? Remove one, or keep both.</p>}
            {c && <VariantGapNote cardKey={c.key} />}
            {looking.has(q.id) && <p className="muted small">Looking again…</p>}
            {lookErrors.get(q.id) && <p className="error small">{lookErrors.get(q.id)}</p>}
          </div>
        )}

        {fixing && q.rec && (
          <div className="queue-wide">
            <ReadFixForm
              recognition={q.rec}
              onSearch={async (r) => {
                await searchAgain(q.id, r)
                setFixingId(null)
              }}
              onCancel={() => setFixingId(null)}
            />
          </div>
        )}
        {showStrip && (
          <div className="queue-wide">
            {/* Zelf gekozen: dan wil je hem ook toevoegen (anders nog een tik op het vinkje). */}
            <CandidateStrip candidates={q.candidates} chosen={q.chosen} label={label} onChoose={(chosen) => updateItem(q.id, { chosen, include: true })} />
          </div>
        )}
        {ready && !fixing && (
          <div className="queue-wide queue-fields">
            <VariantSelect cardKey={c?.key ?? null} value={q.variant} onChange={(variant) => updateItem(q.id, { variant })} label={`Variant of ${label}`} />
            <QtyStepper value={q.quantity} onChange={(quantity) => updateItem(q.id, { quantity })} label={`Quantity of ${label}`} />
            <button type="button" className="ghost small-btn queue-more-btn" aria-expanded={open} onClick={() => toggleExpanded(q.id)}>
              {open ? 'Less' : 'More'}
            </button>
          </div>
        )}
        {ready && !fixing && open && (
          <div className="queue-wide queue-actions">
            {q.rec && (
              <button type="button" className="ghost small-btn" onClick={() => setFixingId(q.id)} disabled={looking.has(q.id)}>
                Correct
              </button>
            )}
            {canLookAgain(q.id) && (
              <button type="button" className="ghost small-btn" onClick={() => void runLookAgain(q.id)} disabled={looking.has(q.id)} title="Read the photo again with the stronger model">
                Look again
              </button>
            )}
            <button type="button" className="ghost small-btn" onClick={() => void draftOf(q).then((d) => onEdit(d, q.id, { rec: q.rec, candidates: q.candidates }))}>
              Edit
            </button>
          </div>
        )}
        {q.status === 'error' && canRetry(q.id) && (
          <div className="queue-wide queue-actions">
            <button type="button" className="ghost small-btn" onClick={() => retry(q.id)}>
              Retry
            </button>
          </div>
        )}
      </li>
    )
  }

  const groups = reviewGroups(queue)
  const twice = scannedTwice(queue)
  // Weggehaald of toegevoegd terwijl het venster open stond: dan niets tonen.
  const comparingItem = comparing ? (queue.find((q) => q.id === comparing) ?? null) : null
  // Hoeveel regels per groep in beeld: de stukken vullen eerst "Check these", dan "Still working", dan "Looks good".
  const budget = { check: shownCount, working: Math.max(0, shownCount - groups.check.length), good: Math.max(0, shownCount - groups.check.length - groups.working.length) }

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
      {queue.some(chineseUnsure) && <ChsCatalogNotice />}

      {(
        [
          ['check', 'Check these', groups.check],
          ['working', 'Still working', groups.working],
          ['good', 'Looks good', groups.good],
        ] as const
      ).map(
        ([key, title, list]) =>
          list.length > 0 && (
            <div key={key} className={`queue-group queue-${key}`}>
              <h3 className="queue-group-title">
                {title} <span className="muted small">{list.length}</span>
              </h3>
              <ul className="binder-scan">{list.slice(0, budget[key]).map(row)}</ul>
            </div>
          ),
      )}
      {queue.length > shownCount && (
        <div ref={moreRef} className="catalog-more">
          <Loading text={`Loading more scans… (${queue.length - shownCount} left)`} />
        </div>
      )}

      {/* Onderbalk op één regel (audit S4): onderin is ruimte kostbaar, alleen de hoofdactie valt op. */}
      <div className="scan-bulk queue-bulk">
        {undo}
        {confirmClear ? (
          <>
            <span className="queue-bulk-ask">
              Clear all {queue.length} {queue.length === 1 ? 'scan' : 'scans'}?
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                removeItems(queue.map((q) => q.id))
                setConfirmClear(false)
              }}
            >
              Clear all
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* Label klein boven de waarde, in hetzelfde vak: zichtbaar label zonder extra regel. */}
            <label className="queue-cond">
              <span className="queue-cond-label">Condition</span>
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
              {busy ? 'Adding…' : `Add ${s.selected}`}
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmClear(true)} disabled={busy}>
              Clear
            </button>
          </>
        )}
      </div>
      {s.busy > 0 && <p className="muted small">You can keep scanning or leave this page; recognition continues while the app is open.</p>}
      {done && (
        <p className="success" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {comparingItem && (
        <ComparePhotos
          item={comparingItem}
          candidate={candidateOf(comparingItem)}
          label={comparingItem.rec ? comparingItem.rec.nameEnglish || comparingItem.rec.namePrinted || 'Unknown card' : 'Photo'}
          onClose={() => setComparing(null)}
        />
      )}
    </section>
  )
}
