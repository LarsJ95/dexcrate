import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react'
import { parseCsv } from '../lib/backup'
import { IMPORT_FIELDS, findDuplicates, guessMapping, rowsToDrafts, type ImportField, type Mapping } from '../lib/csvImport'
import { insertCards, listCards } from '../lib/db'
import { celebrateAdded } from '../lib/celebrate'
import { createBatch, deleteBatch, fileHash, listBatches, undoBatch, type ImportBatch } from '../lib/importBatches'
import { findCandidates, nameSimilarity, type Candidate } from '../lib/match'
import { findExact, lookupLang, stripLangTag } from '../lib/tcgdex'
import type { CardInput, LinkStatus } from '../lib/types'
import { errorText } from '../lib/errors'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 2000

type MatchState =
  | { kind: 'pending' }
  | { kind: 'exact'; key: string }
  | { kind: 'check'; candidate: Candidate }
  | { kind: 'chosen'; key: string; status: LinkStatus }
  | { kind: 'none' }

interface Loaded {
  name: string
  hash: string
  headers: string[]
  rows: string[][]
}

/** Kleine pool: maximaal `n` zoekacties tegelijk (TCGdex heeft zelf ook een wachtrij). */
async function pool<T>(items: readonly T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await work(items[next++])
    }),
  )
}

/** Exacte koppeling op set + nummer (naam moet erop lijken), anders de beste kandidaat ter controle. */
async function matchRow(input: CardInput): Promise<MatchState> {
  const lang = lookupLang(input.language)
  if (input.set_code && input.card_number) {
    const exact = await findExact(lang, input.set_code, input.card_number)
    if (exact && (lang !== 'en' || nameSimilarity(stripLangTag(input.name), exact.name) >= 0.5)) return { kind: 'exact', key: exact.key }
  }
  const candidates = await findCandidates({ name: input.name, set_code: input.set_code, card_number: input.card_number }, lang)
  return candidates[0] ? { kind: 'check', candidate: candidates[0] } : { kind: 'none' }
}

/** CSV-import met kolomkoppeling, controle van twijfelgevallen, duplicaatmelding en terugdraaien. */
export function CsvImport(): JSX.Element {
  const [file, setFile] = useState<Loaded | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [existing, setExisting] = useState<CardInput[]>([])
  const [matches, setMatches] = useState<Map<number, MatchState>>(new Map())
  const [include, setInclude] = useState<Map<number, boolean>>(new Map())
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null)
  const [previous, setPrevious] = useState<ImportBatch[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [confirmRepeat, setConfirmRepeat] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshBatches = (): void => {
    listBatches()
      .then(setBatches)
      .catch((err: unknown) => console.warn('Imports laden mislukt', err))
  }
  useEffect(refreshBatches, [])

  const drafts = useMemo(() => (file ? rowsToDrafts(file.rows, mapping) : []), [file, mapping])
  const duplicates = useMemo(() => findDuplicates(drafts, existing), [drafts, existing])
  // Standaard: alles met een naam, behalve mogelijke duplicaten (die vink je zelf aan).
  const included = (line: number): boolean => include.get(line) ?? !duplicates.has(line)

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setMessage(null)
    setMatches(new Map())
    setInclude(new Map())
    setConfirmRepeat(false)
    if (f.size > MAX_BYTES) {
      setMessage({ ok: false, text: 'This file is larger than 5 MB.' })
      return
    }
    try {
      const [text, hash, cards] = await Promise.all([f.text(), fileHash(f), listCards()])
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error('The file has no rows below the header.')
      if (rows.length - 1 > MAX_ROWS) throw new Error(`At most ${MAX_ROWS} rows per import.`)
      const [headers, ...data] = rows
      setFile({ name: f.name, hash, headers, rows: data })
      setMapping(guessMapping(headers))
      setExisting(cards)
      setPrevious(batches.filter((b) => b.file_hash === hash && !b.reverted_at))
    } catch (err) {
      setFile(null)
      setMessage({ ok: false, text: errorText(err, 'Reading the file failed.') })
    }
  }

  async function checkCards(): Promise<void> {
    const todo = drafts.filter((d) => !d.invalid)
    const found = new Map<number, MatchState>()
    let done = 0
    setChecking({ done, total: todo.length })
    await pool(todo, 4, async (d) => {
      let state: MatchState = { kind: 'none' }
      try {
        state = await matchRow(d.input)
      } catch (err) {
        console.warn(`Koppelen mislukt voor regel ${d.line}`, err)
      }
      found.set(d.line, state)
      done += 1
      if (done % 5 === 0 || done === todo.length) {
        setMatches(new Map(found))
        setChecking(done < todo.length ? { done, total: todo.length } : null)
      }
    })
  }

  async function onImport(): Promise<void> {
    if (!file || busy) return
    const rows = drafts.filter((d) => !d.invalid && included(d.line))
    if (rows.length === 0) {
      setMessage({ ok: false, text: 'No rows selected to import.' })
      return
    }
    setBusy(true)
    setMessage(null)
    let batch: ImportBatch | null = null
    try {
      batch = await createBatch({ source: 'csv', file_name: file.name.slice(0, 200), file_hash: file.hash, row_count: rows.length })
      const inputs: CardInput[] = rows.map((d) => {
        const m = matches.get(d.line)
        const link = m?.kind === 'exact' ? { tcgdex_id: m.key, link_status: 'exact' as const } : m?.kind === 'chosen' ? { tcgdex_id: m.key, link_status: m.status } : { tcgdex_id: null, link_status: null }
        return { ...d.input, ...link, import_batch_id: batch?.id ?? null }
      })
      void celebrateAdded(await insertCards(inputs))
      setMessage({ ok: true, text: `${inputs.length} rows imported. You can undo this import below.` })
      setFile(null)
      refreshBatches()
    } catch (err) {
      if (batch) await deleteBatch(batch.id)
      setMessage({ ok: false, text: errorText(err, 'Import failed.') })
    } finally {
      setBusy(false)
    }
  }

  async function onUndo(b: ImportBatch): Promise<void> {
    if (busy) return
    // Verwijdert kaarten: eerst bevestigen.
    if (confirmUndo !== b.id) {
      setConfirmUndo(b.id)
      return
    }
    setConfirmUndo(null)
    setBusy(true)
    setMessage(null)
    try {
      const r = await undoBatch(b.id)
      setMessage({
        ok: true,
        text: `Import undone: ${r.deleted} rows removed${r.kept > 0 ? `; ${r.kept} kept because they are in a purchase or sale, or no longer owned` : ''}.`,
      })
      refreshBatches()
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, 'Undo failed.') })
    } finally {
      setBusy(false)
    }
  }

  const importable = drafts.filter((d) => !d.invalid && included(d.line)).length
  const checked = matches.size > 0
  const needsChoice = drafts.filter((d) => matches.get(d.line)?.kind === 'check' && included(d.line)).length

  return (
    <div className="panel csv-import">
      <h2 className="panel-title">CSV file</h2>
      <p className="muted small">Any spreadsheet saved as CSV. You choose which column is which; nothing is imported until you confirm.</p>
      <label className="file">
        CSV file (.csv)
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} disabled={busy} />
      </label>

      {file && (
        <>
          <fieldset className="form-group">
            <legend>Columns in {file.name}</legend>
            <div className="form-grid">
              {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => (
                <label key={f}>
                  {IMPORT_FIELDS[f]}
                  <select
                    value={mapping[f] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setMatches(new Map())
                      setMapping((m) => {
                        const next = { ...m }
                        if (v === '') delete next[f]
                        else next[f] = Number(v)
                        return next
                      })
                    }}
                  >
                    <option value="">Not in file</option>
                    {file.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {mapping.name === undefined && <p className="error">Choose which column has the card name.</p>}
          </fieldset>

          {previous.length > 0 && (
            <div className="notice" role="status">
              <p>
                This exact file was already imported on {previous[0].created_at.slice(0, 10)} ({previous[0].row_count} rows). Importing it again adds the
                cards a second time.
              </p>
              <label className="check">
                <input type="checkbox" checked={confirmRepeat} onChange={(e) => setConfirmRepeat(e.target.checked)} />
                These are extra copies, import anyway
              </label>
            </div>
          )}

          <div className="sheet-foot">
            <span className="muted small">
              {drafts.length} rows, {importable} selected
              {duplicates.size > 0 ? `, ${duplicates.size} possible duplicates` : ''}
            </span>
            <span className="spacer" />
            <button type="button" onClick={() => void checkCards()} disabled={busy || checking !== null || mapping.name === undefined}>
              {checked ? 'Check again' : 'Check cards'}
            </button>
          </div>
          {checking && (
            <p aria-live="polite">
              Matching cards: {checking.done} of {checking.total}
            </p>
          )}

          <div className="table-scroll import-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Import</th>
                  <th scope="col">Line</th>
                  <th scope="col">Card</th>
                  <th scope="col">Catalog match</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const m = matches.get(d.line) ?? { kind: 'pending' }
                  const dup = duplicates.get(d.line)
                  return (
                    <tr key={d.line} className={d.invalid ? 'invalid' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Import line ${d.line}`}
                          disabled={d.invalid}
                          checked={!d.invalid && included(d.line)}
                          onChange={(e) => setInclude((s) => new Map(s).set(d.line, e.target.checked))}
                        />
                      </td>
                      <td>{d.line}</td>
                      <td>
                        {d.invalid ? (
                          <span className="error">No name: cannot import</span>
                        ) : (
                          <>
                            {d.input.quantity > 1 ? `${d.input.quantity}× ` : ''}
                            {d.input.name}
                            <span className="muted small"> {[d.input.set_code, d.input.card_number && `#${d.input.card_number}`].filter(Boolean).join(' ')}</span>
                          </>
                        )}
                      </td>
                      <td>
                        {m.kind === 'pending' && <span className="muted small">{d.invalid ? '' : 'Not checked yet'}</span>}
                        {m.kind === 'exact' && <span className="up small">Exact match</span>}
                        {m.kind === 'chosen' && <span className="small">Linked ({m.status === 'approximate' ? 'your choice' : 'manual'})</span>}
                        {m.kind === 'none' && <span className="muted small">Not recognised: imported without link</span>}
                        {m.kind === 'check' && (
                          <span className="match-choice">
                            <span className="small">
                              Check: {m.candidate.name} ({m.candidate.setName} #{m.candidate.localId}), {m.candidate.reason.toLowerCase()}
                            </span>
                            <span>
                              <button
                                type="button"
                                className="small-btn"
                                onClick={() => setMatches((s) => new Map(s).set(d.line, { kind: 'chosen', key: m.candidate.key, status: 'approximate' }))}
                              >
                                Use this
                              </button>
                              <button type="button" className="ghost small-btn" onClick={() => setMatches((s) => new Map(s).set(d.line, { kind: 'none' }))}>
                                No link
                              </button>
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="small">
                        {dup && <span className="notice-inline">{dup === 'collection' ? 'Already in your collection' : 'Also earlier in this file'}</span>}
                        {d.problems.map((p) => (
                          <span key={p} className="muted">
                            {p}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="sheet-foot">
            {needsChoice > 0 && <span className="muted small">{needsChoice} rows wait for your check; they are imported without link if you continue.</span>}
            <span className="spacer" />
            <button type="button" className="ghost" onClick={() => setFile(null)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void onImport()}
              disabled={busy || importable === 0 || mapping.name === undefined || (previous.length > 0 && !confirmRepeat)}
            >
              {busy ? 'Importing…' : `Import ${importable} rows`}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className={message.ok ? 'success' : 'error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      {batches.length > 0 && (
        <fieldset className="form-group">
          <legend>Recent imports</legend>
          <ul className="doc-list">
            {batches.map((b) => (
              <li key={b.id}>
                <span>
                  {b.created_at.slice(0, 10)}: {b.file_name ?? b.source}, {b.row_count} rows{b.reverted_at ? ' (undone)' : ''}
                </span>
                {!b.reverted_at && (
                  <button
                    type="button"
                    className={confirmUndo === b.id ? 'danger small-btn' : 'ghost small-btn danger-text'}
                    onClick={() => void onUndo(b)}
                    disabled={busy}
                  >
                    {confirmUndo === b.id ? `Confirm: remove ${b.row_count} rows` : 'Undo'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </div>
  )
}
