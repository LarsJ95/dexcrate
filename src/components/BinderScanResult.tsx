import { useEffect, useMemo, useState, type JSX } from 'react'
import { insertCards } from '../lib/db'
import { findCandidates, type Candidate } from '../lib/match'
import { draftFromScan, type Recognition } from '../lib/scan'
import { imageUrl, lookupLang } from '../lib/tcgdex'
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
            name: (draft.name ?? '').slice(0, 200) || 'Onbekende kaart',
            condition: condition || null,
            sort_order: nextSortOrder + i,
          }
        }),
      )
      onAdded(await insertCards(inputs))
      setAdded((s) => new Set([...s, ...selected.map((r) => r.rec.position)]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toevoegen mislukt.')
    } finally {
      setBusy(false)
    }
  }

  async function edit(r: Row): Promise<void> {
    onEdit(await draftFromScan(r.rec, candidateOf(r), lookupLang(r.rec.language)), r.rec.position)
  }

  if (recognitions.length === 0) {
    return <p className="notice">Geen kaarten herkend op deze foto. Probeer het opnieuw met meer licht en minder schuine hoek.</p>
  }

  return (
    <div className="scan-result">
      <h2>
        {recognitions.length} {recognitions.length === 1 ? 'kaart' : 'kaarten'} herkend
      </h2>
      <p className="muted small">Controleer per kaart de match. Vink uit wat je niet wilt toevoegen.</p>

      <ul className="binder-scan">
        {open.map((r) => {
          const c = candidateOf(r)
          const owned = c ? ownedByKey.get(c.key) : undefined
          const label = r.rec.nameEnglish || r.rec.namePrinted || `Kaart ${r.rec.position}`
          return (
            <li key={r.rec.position} className={`scan-row${r.include ? ' on' : ''}`}>
              <label className="scan-check">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => update(r.rec.position, { include: e.target.checked })}
                  aria-label={`${label} toevoegen`}
                />
              </label>
              <span className="scan-thumb">
                {c?.image ? (
                  <img src={imageUrl(c.image, 'low') ?? ''} alt="" loading="lazy" />
                ) : (
                  <span className="card-img placeholder"><span>{r.candidates === undefined ? '…' : 'Geen match'}</span></span>
                )}
              </span>
              <div className="scan-info">
                <p className="tile-name">
                  {r.rec.position}. {label}
                </p>
                <p className="muted small">
                  Gelezen:{' '}
                  {[r.rec.setCode, r.rec.cardNumber, r.rec.language ? LANGUAGE_LABELS[r.rec.language] : null]
                    .filter(Boolean)
                    .join(', ') || 'onleesbaar'}
                  {r.rec.confidence !== 'high' && ' (twijfel)'}
                </p>
                {r.candidates && r.candidates.length > 0 && (
                  <select
                    aria-label={`Match voor ${label}`}
                    value={r.chosen}
                    onChange={(e) => update(r.rec.position, { chosen: e.target.value })}
                  >
                    {r.candidates.map((cand) => (
                      <option key={cand.key} value={cand.key}>
                        {cand.name}, {cand.setName} {cand.localId}
                      </option>
                    ))}
                    <option value="">Zonder koppeling toevoegen</option>
                  </select>
                )}
                {owned && <p className="small">Al {owned}× in bezit</p>}
              </div>
              <button type="button" className="ghost" onClick={() => void edit(r)} disabled={r.candidates === undefined}>
                Bewerken
              </button>
            </li>
          )
        })}
      </ul>

      {open.length === 0 ? (
        <p className="success" role="status">Alle kaarten van deze foto zijn verwerkt.</p>
      ) : (
        <div className="scan-bulk">
          <label>
            Conditie voor de selectie
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
              <option value="">Onbekend</option>
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((k) => (
                <option key={k} value={k}>{CONDITION_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void addSelected()} disabled={busy || searching || selected.length === 0}>
            {busy ? 'Toevoegen…' : searching ? 'Kaarten opzoeken…' : `${selected.length} toevoegen aan collectie`}
          </button>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Niet toevoegen
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
