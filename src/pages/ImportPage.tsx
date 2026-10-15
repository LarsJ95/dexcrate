import { useEffect, useState, type ChangeEvent, type JSX } from 'react'
import { countCards, insertCards } from '../lib/db'
import { parseWorkbook } from '../lib/excel'
import { resolveTcgdexIds } from '../lib/match'
import { computeStats, formatEur } from '../lib/stats'
import type { CardInput } from '../lib/types'

interface Preview {
  cards: CardInput[]
  warnings: string[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; message: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024

export function ImportPage(): JSX.Element {
  const [existing, setExisting] = useState<number | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    countCards()
      .then((n) => {
        if (!cancelled) setExisting(n)
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: 'error', message: 'File is larger than 10 MB.' })
      return
    }
    setPreview(null)
    try {
      setStatus({ kind: 'busy', message: 'Reading Excel file…' })
      const parsed = await parseWorkbook(await file.arrayBuffer())
      setStatus({ kind: 'busy', message: 'Linking cards…' })
      setPreview({ cards: await resolveTcgdexIds(parsed.cards), warnings: parsed.warnings })
      setStatus({ kind: 'idle' })
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Reading failed.' })
    }
  }

  async function onImport(): Promise<void> {
    if (!preview || status.kind === 'busy') return
    setStatus({ kind: 'busy', message: 'Saving…' })
    try {
      await insertCards(preview.cards)
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Saving failed.' })
      return
    }
    setPreview(null)
    setRefreshKey((k) => k + 1)
    setStatus({ kind: 'done', message: `${preview.cards.length} rows imported.` })
  }

  const stats = preview ? computeStats(preview.cards) : null
  const missing = preview ? preview.cards.filter((c) => c.kind === 'card' && !c.tcgdex_id) : []
  const busy = status.kind === 'busy'
  const blocked = existing === null || existing > 0

  return (
    <section className="page">
      <h1>Import</h1>
      {existing !== null && existing > 0 && (
        <p className="notice">
          Your collection already has {existing} rows. Import is disabled to prevent duplicates.
        </p>
      )}

      <label className="file">
        Excel file (.xlsx)
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          disabled={busy}
        />
      </label>

      {status.kind === 'busy' && <p aria-live="polite">{status.message}</p>}
      {status.kind === 'error' && <p className="error" role="alert">{status.message}</p>}
      {status.kind === 'done' && <p className="success" role="status">{status.message}</p>}

      {preview && stats && (
        <div className="preview">
          <h2>Check</h2>
          <table>
            <tbody>
              <tr><th scope="row">Sold</th><td>{formatEur(stats.sold.amount)}</td><td>{stats.sold.count} cards</td></tr>
              <tr><th scope="row">For sale</th><td>{formatEur(stats.forSale.amount)}</td><td>{stats.forSale.count} cards</td></tr>
              <tr><th scope="row">Bought</th><td>{formatEur(stats.bought.amount)}</td><td>{stats.bought.count} items</td></tr>
              <tr><th scope="row">Net</th><td>{formatEur(stats.net)}</td><td /></tr>
            </tbody>
          </table>
          <p>
            {preview.cards.length} rows.{' '}
            {missing.length === 0 ? 'All cards linked.' : `${missing.length} cards could not be linked automatically:`}
          </p>
          {missing.length > 0 && (
            <ul>
              {missing.map((m, i) => (
                <li key={`${m.name}-${i}`}>
                  {m.name}: {m.set_code ?? '?'} {m.card_number ?? ''}
                </li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <>
              <h2>Warnings</h2>
              <ul>{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          )}
          <button type="button" className="primary" onClick={onImport} disabled={busy || blocked}>
            Import
          </button>
        </div>
      )}
    </section>
  )
}
