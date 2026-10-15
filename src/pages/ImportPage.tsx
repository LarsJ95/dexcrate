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
      setStatus({ kind: 'error', message: 'Bestand is groter dan 10 MB.' })
      return
    }
    setPreview(null)
    try {
      setStatus({ kind: 'busy', message: 'Excel inlezen…' })
      const parsed = await parseWorkbook(await file.arrayBuffer())
      setStatus({ kind: 'busy', message: 'Kaarten koppelen aan de kaartdatabase…' })
      setPreview({ cards: await resolveTcgdexIds(parsed.cards), warnings: parsed.warnings })
      setStatus({ kind: 'idle' })
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Inlezen mislukt.' })
    }
  }

  async function onImport(): Promise<void> {
    if (!preview || status.kind === 'busy') return
    setStatus({ kind: 'busy', message: 'Opslaan in database…' })
    try {
      await insertCards(preview.cards)
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Opslaan mislukt.' })
      return
    }
    setPreview(null)
    setRefreshKey((k) => k + 1)
    setStatus({ kind: 'done', message: `${preview.cards.length} regels geïmporteerd.` })
  }

  const stats = preview ? computeStats(preview.cards) : null
  const missing = preview ? preview.cards.filter((c) => c.kind === 'card' && !c.tcgdex_id) : []
  const busy = status.kind === 'busy'
  const blocked = existing === null || existing > 0

  return (
    <section className="page">
      <h1>Excel importeren</h1>
      <p className="muted">
        Verkooplijst wordt "Te koop" of "Verkocht", aankooplijst wordt "In collectie".
      </p>
      {existing !== null && existing > 0 && (
        <p className="notice">
          Je collectie bevat al {existing} regels. Importeren is uitgeschakeld om dubbele regels te voorkomen.
        </p>
      )}

      <label className="file">
        Kies je Excel-bestand (.xlsx)
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
          <h2>Controle</h2>
          <table>
            <tbody>
              <tr><th scope="row">Verkocht</th><td>{formatEur(stats.sold.amount)}</td><td>{stats.sold.count} kaarten</td></tr>
              <tr><th scope="row">Te koop</th><td>{formatEur(stats.forSale.amount)}</td><td>{stats.forSale.count} kaarten</td></tr>
              <tr><th scope="row">Gekocht</th><td>{formatEur(stats.bought.amount)}</td><td>{stats.bought.count} stuks</td></tr>
              <tr><th scope="row">Netto</th><td>{formatEur(stats.net)}</td><td /></tr>
            </tbody>
          </table>
          <p>
            {preview.cards.length} regels.{' '}
            {missing.length === 0 ? 'Alle kaarten gekoppeld.' : `${missing.length} kaarten niet automatisch gekoppeld (kun je later koppelen):`}
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
              <h2>Waarschuwingen</h2>
              <ul>{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </>
          )}
          <button type="button" onClick={onImport} disabled={busy || blocked}>
            Importeren
          </button>
        </div>
      )}
    </section>
  )
}
