import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { insertCards } from '../lib/db'
import { addedQuietly } from '../lib/celebrate'
import { onChsCatalogReady } from '../lib/chsCatalog'
import { autoPick, type Candidate } from '../lib/match'
import { recordChoices, scanCandidates, type ChoiceInput } from '../lib/scanMemory'
import { draftFromScan, type Recognition } from '../lib/scan'
import { readLabel } from '../lib/scanResult'
import { isAmbiguous } from '../lib/scanQueue'
import { CandidateStrip } from './ScanQueueParts'
import { lookupLang } from '../lib/tcgdex'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { ChsCatalogNotice } from './ChsCatalogNotice'
import { LazyCardPrice } from './LazyCardPrice'
import { VariantGapNote, VariantSelect } from './VariantSelect'
import { CONDITION_LABELS, EMPTY_CARD, type Card, type CardInput, type Condition, type Variant } from '../lib/types'
import { errorText } from '../lib/errors'
import { fitVariant, variantFacts } from '../lib/variantChoice'

interface Props {
  recognitions: Recognition[]
  ownedByKey: ReadonlyMap<string, number>
  nextSortOrder: number
  onAdded: (rows: Card[]) => void
  /** Eén kaart uitgebreid bewerken in het gewone formulier. */
  onEdit: (draft: Partial<CardInput>, position: number, choice: Omit<ChoiceInput, 'chosen'>) => void
  /** Posities die al via het formulier zijn toegevoegd. */
  done: ReadonlySet<number>
  onCancel: () => void
}

const isChinese = (rec: Recognition): boolean => rec.language === 'zh-cn' || rec.language === 'zh-tw'

/** Moet je zelf de kaart kiezen? Dan staan de kandidaten meteen als foto's in beeld. */
const needsPick = (candidates: readonly Candidate[]): boolean => !autoPick(candidates) || isAmbiguous({ candidates: [...candidates] })

interface Row {
  rec: Recognition
  /** undefined = nog aan het zoeken */
  candidates?: Candidate[]
  /** Gekozen kaart-sleutel; '' = zonder koppeling toevoegen. */
  chosen: string
  include: boolean
  /** Uitvoering; de gelezen, als die volgens de catalogus bestaat. */
  variant: Variant | null
}

export function BinderScanResult({ recognitions, ownedByKey, nextSortOrder, onAdded, onEdit, done, onCancel }: Props): JSX.Element {
  const [rows, setRows] = useState<Row[]>(() => recognitions.map((rec) => ({ rec, chosen: '', include: false, variant: rec.variant })))
  const [condition, setCondition] = useState<Condition | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Kaarten met "More" open: kandidaten en Edit zichtbaar. */
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const toggleExpanded = (position: number): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (!next.delete(position)) next.add(position)
      return next
    })

  // Chinese catalogus net binnen: opnieuw zoeken (regels die je zelf aanpaste blijven zoals ze zijn).
  const [catalogRound, setCatalogRound] = useState(0)
  useEffect(() => onChsCatalogReady(() => setCatalogRound((n) => n + 1)), [])
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  })

  // Per kaart kandidaten zoeken (TCGdex-verzoeken worden centraal begrensd).
  useEffect(() => {
    let cancelled = false
    recognitions.forEach((rec, i) => {
      const row = rowsRef.current[i]
      if (catalogRound > 0 && (!isChinese(rec) || !row?.candidates || row.chosen !== (autoPick(row.candidates)?.key ?? ''))) return
      scanCandidates(rec)
        .catch((err: unknown) => {
          console.error(`Zoeken mislukt voor kaart ${rec.position}`, err)
          return [] as Candidate[]
        })
        .then(async (candidates) => {
          const best = autoPick(candidates)
          const facts = await variantFacts(best?.key)
          if (cancelled) return
          setRows((list) =>
            list.map((r, j) =>
              j === i
                ? {
                    ...r,
                    candidates,
                    chosen: best?.key ?? '',
                    // Alleen standaard aanvinken als er een match is en de kaart leesbaar was.
                    include: best !== null && rec.confidence !== 'low',
                    variant: fitVariant(rec.variant, best ? facts.variants : null),
                  }
                : r,
            ),
          )
        })
    })
    return () => {
      cancelled = true
    }
  }, [recognitions, catalogRound])

  const [added, setAdded] = useState<ReadonlySet<number>>(new Set())
  const open = useMemo(
    () => rows.filter((r) => !done.has(r.rec.position) && !added.has(r.rec.position)),
    [rows, done, added],
  )
  const selected = open.filter((r) => r.include)
  const searching = rows.some((r) => r.candidates === undefined)

  const update = (position: number, patch: Partial<Row>): void =>
    setRows((list) => list.map((r) => (r.rec.position === position ? { ...r, ...patch } : r)))

  const candidateOf = (r: Row): Candidate | null => r.candidates?.find((c) => c.key === r.chosen) ?? null

  async function addSelected(): Promise<void> {
    if (busy || selected.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const inputs = await Promise.all(
        selected.map(async (r, i): Promise<CardInput> => {
          const draft = await draftFromScan(r.rec, candidateOf(r), lookupLang(r.rec.language))
          return {
            ...EMPTY_CARD,
            ...draft,
            variant: r.variant,
            name: (draft.name ?? '').slice(0, 200) || 'Unknown card',
            condition: condition || null,
            sort_order: nextSortOrder + i,
          }
        }),
      )
      const rows = await insertCards(inputs)
      // Andere kaart dan de app voorstelde: onthouden voor de volgende keer.
      void recordChoices(selected.map((r) => ({ rec: r.rec, candidates: r.candidates ?? [], chosen: r.chosen || null })))
      onAdded(rows)
      void addedQuietly(rows)
      setAdded((s) => new Set([...s, ...selected.map((r) => r.rec.position)]))
    } catch (err) {
      setError(errorText(err, 'Adding failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function edit(r: Row): Promise<void> {
    onEdit({ ...(await draftFromScan(r.rec, candidateOf(r), lookupLang(r.rec.language))), variant: r.variant }, r.rec.position, { rec: r.rec, candidates: r.candidates ?? [] })
  }

  if (recognitions.length === 0) {
    return <p className="notice">No cards found in this photo. Try again with more light and less angle.</p>
  }

  return (
    <div className="scan-result">
      <h2>
        {recognitions.length} {recognitions.length === 1 ? 'card' : 'cards'} found
      </h2>
      {rows.some((r) => isChinese(r.rec) && r.candidates !== undefined && !autoPick(r.candidates)) && <ChsCatalogNotice />}

      {/* Zelfde compacte regel als Quick scan (audit B2, 20-10-2026); een binderfoto heeft geen eigen foto per kaart. */}
      <ul className="binder-scan">
        {open.map((r) => {
          const c = candidateOf(r)
          const owned = c ? ownedByKey.get(c.key) : undefined
          const label = r.rec.nameEnglish || r.rec.namePrinted || `Card ${r.rec.position}`
          const found = r.candidates !== undefined
          const pick = found && needsPick(r.candidates ?? [])
          const more = expanded.has(r.rec.position)
          const showStrip = found && (r.candidates ?? []).length > 0 && (pick || more)
          return (
            <li key={r.rec.position} className={`scan-row queue-row${r.include ? ' on' : ''}`}>
              <label className="scan-check">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(r.rec.position, { include: e.target.checked })}
                  aria-label={`Add ${label}`}
                />
              </label>
              <span className="queue-photos">
                <span className="scan-thumb">
                  {c ? (
                    <CatalogKeyPicture cardKey={c.key} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={`#${c.localId}`} />} />
                  ) : (
                    <CardFace name={label} detail={r.rec.cardNumber ? `#${r.rec.cardNumber}` : undefined} loading={!found} />
                  )}
                </span>
              </span>
              <div className="scan-info">
                <p className="tile-name">
                  {r.rec.position}. {label}
                </p>
                {!found && <p className="muted small">Looking up…</p>}
                {/* Bij twijfel zonder keuze zegt de knop "No link" in de strook al wat er gebeurt. */}
                {found && (c || !showStrip) && (
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
                {/* Wat de scan las alleen bij twijfel (S5). */}
                {(r.rec.confidence !== 'high' || pick) && <p className="muted small">{readLabel(r.rec)}</p>}
              </div>
              {found && (
                <div className="queue-wide queue-notes">
                  {pick && <p className="queue-why small">Not sure: tap the right card.</p>}
                  {c && <VariantGapNote cardKey={c.key} />}
                </div>
              )}
              {showStrip && (
                <div className="queue-wide">
                  {/* Zelf gekozen: dan wil je hem ook toevoegen. */}
                  <CandidateStrip candidates={r.candidates ?? []} chosen={r.chosen} label={label} onChoose={(chosen) => update(r.rec.position, { chosen, include: true })} />
                </div>
              )}
              {found && (
                <div className="queue-wide queue-fields">
                  <VariantSelect cardKey={c?.key ?? null} value={r.variant} onChange={(variant) => update(r.rec.position, { variant })} label={`Variant of ${label}`} />
                  <button type="button" className="ghost small-btn queue-more-btn" aria-expanded={more} onClick={() => toggleExpanded(r.rec.position)}>
                    {more ? 'Less' : 'More'}
                  </button>
                </div>
              )}
              {found && more && (
                <div className="queue-wide queue-actions">
                  <button type="button" className="ghost small-btn" onClick={() => void edit(r)}>
                    Edit
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {open.length === 0 ? (
        <p className="success" role="status">All cards from this photo are done.</p>
      ) : (
        <div className="scan-bulk queue-bulk">
          <label className="queue-cond">
            <span className="queue-cond-label">Condition</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Unknown</option>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((k) => (
                <option key={k} value={k}>
                  {CONDITION_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => void addSelected()} disabled={busy || searching || selected.length === 0}>
            {busy ? 'Adding…' : searching ? 'Looking up…' : `Add ${selected.length}`}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Discard
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
