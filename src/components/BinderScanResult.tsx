import { useEffect, useMemo, useState, type JSX } from 'react'
import { insertCards } from '../lib/db'
import { findCandidates, type Candidate } from '../lib/match'
import { draftFromScan, type Recognition } from '../lib/scan'
import { imageCandidatesForKey, lookupLang } from '../lib/tcgdex'
import { CardFace } from './CardFace'
import { CardPicture } from './CardPicture'
import { CONDITION_LABELS, EMPTY_CARD, LANGUAGE_LABELS, type Card, type CardInput, type Condition } from '../lib/types'

interface Props {
  recognitions: Recognition[]
  ownedByKey: ReadonlyMap<string, number>
  nextSortOrder: number
  onAdded: (rows: Card[]) => void
  /** Eén kaart uitgebreid bewerken in het gewone formulier. */
  onEdit: (draft: Partial<CardInput>, position: number) => void
  /** Posities die al via het formulier zijn toegevoegd. */
  done: ReadonlySet<number>
  onCancel: () => void
}

interface Row {
  rec: Recognition
  /** undefined = nog aan het zoeken */
  candidates?: Candidate[]
  /** Gekozen kaart-sleutel; '' = zonder koppeling toevoegen. */
  chosen: string
  include: boolean
}

export function BinderScanResult({ recognitions, ownedByKey, nextSortOrder, onAdded, onEdit, done, onCancel }: Props): JSX.Element {
  const [rows, setRows] = useState<Row[]>(() => recognitions.map((rec) => ({ rec, chosen: '', include: false })))
  const [condition, setCondition] = useState<Condition | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per kaart kandidaten zoeken (TCGdex-verzoeken worden centraal begrensd).
  useEffect(() => {
    let cancelled = false
    recognitions.forEach((rec, i) => {
      findCandidates(
        { name: rec.nameEnglish, set_code: rec.setCode || null, card_number: rec.cardNumber || null },
        lookupLang(rec.language),
      )
        .catch((err: unknown) => {
          console.error(`Zoeken mislukt voor kaart ${rec.position}`, err)
          return [] as Candidate[]
        })
        .then((candidates) => {
          if (cancelled) return
          setRows((list) =>
            list.map((r, j) =>
              j === i
                ? {
                    ...r,
                    candidates,
                    chosen: candidates[0]?.key ?? '',
                    // Alleen standaard aanvinken als er een match is en de kaart leesbaar was.
                    include: candidates.length > 0 && rec.confidence !== 'low',
                  }
                : r,
            ),
          )
        })
    })
    return () => {
      cancelled = true
    }
  }, [recognitions])

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
            name: (draft.name ?? '').slice(0, 200) || 'Unknown card',
            condition: condition || null,
            sort_order: nextSortOrder + i,
          }
        }),
      )
      onAdded(await insertCards(inputs))
      setAdded((s) => new Set([...s, ...selected.map((r) => r.rec.position)]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adding failed.')
    } finally {
      setBusy(false)
    }
  }

  async function edit(r: Row): Promise<void> {
    onEdit(await draftFromScan(r.rec, candidateOf(r), lookupLang(r.rec.language)), r.rec.position)
  }

  if (recognitions.length === 0) {
    return <p className="notice">No cards found in this photo. Try again with more light and less angle.</p>
  }

  return (
    <div className="scan-result">
      <h2>
        {recognitions.length} {recognitions.length === 1 ? 'card' : 'cards'} found
      </h2>

      <ul className="binder-scan">
        {open.map((r) => {
          const c = candidateOf(r)
          const owned = c ? ownedByKey.get(c.key) : undefined
          const label = r.rec.nameEnglish || r.rec.namePrinted || `Card ${r.rec.position}`
          return (
            <li key={r.rec.position} className={`scan-row${r.include ? ' on' : ''}`}>
              <label className="scan-check">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(r.rec.position, { include: e.target.checked })}
                  aria-label={`Add ${label}`}
                />
              </label>
              <span className="scan-thumb">
                <CardPicture
                  sources={c ? imageCandidatesForKey(c.key, c.image, 'low') : []}
                  alt=""
                  fallback={
                    <CardFace
                      name={c?.name ?? label}
                      detail={c ? `${c.setName} #${c.localId}` : [r.rec.setCode, r.rec.cardNumber].filter(Boolean).join(' ')}
                      loading={r.candidates === undefined}
                    />
                  }
                />
              </span>
              <div className="scan-info">
                <p className="tile-name">
                  {r.rec.position}. {label}
                </p>
                <p className="muted small">
                  Read:{' '}
                  {[r.rec.setCode, r.rec.cardNumber, r.rec.language ? LANGUAGE_LABELS[r.rec.language] : null]
                    .filter(Boolean)
                    .join(', ') || 'unreadable'}
                  {r.rec.confidence !== 'high' && ' (uncertain)'}
                </p>
                {r.candidates && r.candidates.length > 0 && (
                  <select
                    aria-label={`Match for ${label}`}
                    value={r.chosen}
                    onChange={(e) => update(r.rec.position, { chosen: e.target.value })}
                  >
                    {r.candidates.map((cand) => (
                      <option key={cand.key} value={cand.key}>
                        {cand.name}, {cand.setName} {cand.localId}
                      </option>
                    ))}
                    <option value="">Add without link</option>
                  </select>
                )}
                {owned && <p className="small">Owned {owned}×</p>}
              </div>
              <button type="button" className="ghost" onClick={() => void edit(r)} disabled={r.candidates === undefined}>
                Edit
              </button>
            </li>
          )
        })}
      </ul>

      {open.length === 0 ? (
        <p className="success" role="status">All cards from this photo are done.</p>
      ) : (
        <div className="scan-bulk">
          <label>
            Condition
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Unknown</option>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((k) => (
                <option key={k} value={k}>{CONDITION_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void addSelected()} disabled={busy || searching || selected.length === 0}>
            {busy ? 'Adding…' : searching ? 'Looking up…' : `Add ${selected.length} to collection`}
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
