import { useEffect, useState, type ChangeEvent, type JSX } from 'react'
import { parseWorkbook } from '../lib/excel'
import { computeStats, formatEur } from '../lib/stats'
import { supabase } from '../lib/supabase'
import { resolveTcgdexIds } from '../lib/match'
import type { ItemInput, PurchaseInput, SaleInput } from '../lib/types'

interface Preview {
  sales: SaleInput[]
  purchases: PurchaseInput[]
  warnings: string[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; message: string }

const MAX_FILE_BYTES = 10 * 1024 * 1024

async function countRows(table: 'sales' | 'purchases'): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table} tellen mislukt: ${error.message}`)
  return count ?? 0
}

function unmatched(items: readonly ItemInput[]): ItemInput[] {
  return items.filter((i) => i.kind === 'card' && !i.tcgdex_id)
}

export function ImportPage(): JSX.Element {
  const [existing, setExisting] = useState<number | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([countRows('sales'), countRows('purchases')])
      .then(([s, p]) => {
        if (!cancelled) setExisting(s + p)
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
      setStatus({ kind: 'busy', message: 'Kaarten koppelen aan TCGdex…' })
      const [sales, purchases] = await Promise.all([
        resolveTcgdexIds(parsed.sales),
        resolveTcgdexIds(parsed.purchases),
      ])
      setPreview({ sales, purchases, warnings: parsed.warnings })
      setStatus({ kind: 'idle' })
    } catch (err) {
      console.error(err)
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Inlezen mislukt.' })
    }
  }

  async function onImport(): Promise<void> {
    if (!preview || status.kind === 'busy') return
    setStatus({ kind: 'busy', message: 'Opslaan in database…' })
    const { data: inserted, error: salesErr } = await supabase.from('sales').insert(preview.sales).select('id')
    if (salesErr) {
      setStatus({ kind: 'error', message: `Verkooplijst opslaan mislukt: ${salesErr.message}` })
      return
    }
    const { error: purchErr } = await supabase.from('purchases').insert(preview.purchases)
    if (purchErr) {
      // Geen half-geïmporteerde staat achterlaten.
      const ids = inserted.map((r) => r.id as string)
      const { error: rollbackErr } = await supabase.from('sales').delete().in('id', ids)
      if (rollbackErr) console.error('Terugdraaien verkooplijst mislukt', rollbackErr)
      setStatus({ kind: 'error', message: `Aankooplijst opslaan mislukt: ${purchErr.message}` })
      return
    }
    setPreview(null)
    setRefreshKey((k) => k + 1)
    setStatus({
      kind: 'done',
      message: `${preview.sales.length} verkoopregels en ${preview.purchases.length} aankoopregels geïmporteerd.`,
    })
  }

  const stats = preview ? computeStats(preview.sales, preview.purchases) : null
  const missing = preview ? [...unmatched(preview.sales), ...unmatched(preview.purchases)] : []
  const busy = status.kind === 'busy'
  const blocked = existing === null || existing > 0

  return (
    <section className="page">
      <h2>Excel importeren</h2>
      {existing !== null && existing > 0 && (
        <p className="notice">
          De database bevat al {existing} regels. Importeren is uitgeschakeld om dubbele regels te voorkomen.
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
          <h3>Controle</h3>
          <table>
            <tbody>
              <tr><th scope="row">Verkocht</th><td>{formatEur(stats.sold.amount)}</td><td>{stats.sold.count} kaarten</td></tr>
              <tr><th scope="row">Te koop</th><td>{formatEur(stats.forSale.amount)}</td><td>{stats.forSale.count} kaarten</td></tr>
              <tr><th scope="row">Gekocht</th><td>{formatEur(stats.bought.amount)}</td><td>{stats.bought.count} stuks</td></tr>
              <tr><th scope="row">Netto</th><td>{formatEur(stats.net)}</td><td /></tr>
            </tbody>
          </table>
          <p>
            {preview.sales.length} verkoopregels, {preview.purchases.length} aankoopregels.{' '}
            {missing.length === 0 ? 'Alle kaarten gekoppeld.' : `${missing.length} kaarten niet automatisch gekoppeld (kun je later koppelen):`}
          </p>
          {missing.length > 0 && (
            <ul>
              {missing.map((m, i) => (
                <li key={`${m.name}-${i}`}>
                  {m.name} — {m.set_code ?? '?'} {m.card_number ?? ''}
                </li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <>
              <h3>Waarschuwingen</h3>
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
