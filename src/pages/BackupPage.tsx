import { useRef, useState, type ChangeEvent, type JSX } from 'react'
import { compareTables, parseBackup, toCsv, type Backup, type Row } from '../lib/backup'
import { createBackup, downloadFile, fetchAllTables, restoreBackup } from '../lib/backupDb'
import { today } from '../lib/money'

const CARD_COLUMNS = [
  'id',
  'name',
  'set_code',
  'card_number',
  'quantity',
  'kind',
  'language',
  'variant',
  'condition',
  'grading_company',
  'grade',
  'cert_number',
  'edition',
  'ownership',
  'availability',
  'purchase_price',
  'purchase_date',
  'purchase_channel',
  'sale_price',
  'sale_date',
  'sale_channel',
  'tcgdex_id',
  'link_status',
  'notes',
  'created_at',
]

const TX_COLUMNS = [
  'transaction_id',
  'kind',
  'status',
  'occurred_on',
  'channel',
  'counterparty',
  'amount',
  'shipping_amount',
  'fees_amount',
  'shipping_cost',
  'refund_amount',
  'card_id',
  'card_name',
  'quantity',
  'unit_amount',
]

type Check = { backup: Backup; rows: ReturnType<typeof compareTables> }

/** Export (JSON-back-up en CSV) en herstel. */
export function BackupPage(): JSX.Element {
  const [withFiles, setWithFiles] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [confirm, setConfirm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<string>): Promise<void> {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ ok: true, text: await action() })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const onBackup = (): Promise<void> =>
    run(async () => {
      const { backup, missingFiles } = await createBackup(withFiles, setProgress)
      downloadFile(`dexcrate-backup-${today()}.json`, JSON.stringify(backup), 'application/json')
      const total = Object.values(backup.tables).reduce((n, rows) => n + (rows?.length ?? 0), 0)
      return `Backup downloaded: ${total} rows${withFiles ? `, ${Object.keys(backup.files).length} files` : ''}.${
        missingFiles > 0 ? ` ${missingFiles} files could not be found in storage.` : ''
      }`
    })

  const onCsv = (): Promise<void> =>
    run(async () => {
      setProgress('Reading your data…')
      const t = await fetchAllTables()
      const cards = t.cards ?? []
      downloadFile(`dexcrate-cards-${today()}.csv`, toCsv(cards, CARD_COLUMNS), 'text/csv;charset=utf-8')
      if (t.transactions) {
        const names = new Map(cards.map((c) => [c.id, c.name]))
        const lines: Row[] = []
        for (const tx of t.transactions) {
          const own = (t.transaction_lines ?? []).filter((l) => l.transaction_id === tx.id)
          for (const l of own.length > 0 ? own : [{}]) {
            lines.push({ ...tx, transaction_id: tx.id, card_id: l.card_id ?? null, card_name: names.get(l.card_id) ?? null, quantity: l.quantity ?? null, unit_amount: l.unit_amount ?? null })
          }
        }
        downloadFile(`dexcrate-transactions-${today()}.csv`, toCsv(lines, TX_COLUMNS), 'text/csv;charset=utf-8')
      }
      return `CSV downloaded: ${cards.length} card rows${t.transactions ? ` and ${t.transactions.length} transactions` : ''}.`
    })

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCheck(null)
    setConfirm(false)
    void run(async () => {
      setProgress('Checking the backup…')
      const backup = parseBackup(await file.text())
      const current = await fetchAllTables()
      setCheck({ backup, rows: compareTables(backup.tables, current) })
      return `Backup from ${backup.exported_at.slice(0, 10) || 'unknown date'} checked. Nothing has been changed yet.`
    })
  }

  const onRestore = (): Promise<void> =>
    run(async () => {
      if (!check) throw new Error('Choose a backup file first.')
      const r = await restoreBackup(check.backup, setProgress)
      setCheck(null)
      setConfirm(false)
      const rows = Object.values(r.rows).reduce((n, v) => n + (v ?? 0), 0)
      return `Restored ${rows} rows and ${r.files} files.${r.skippedTables.length > 0 ? ` Skipped (not set up yet): ${r.skippedTables.join(', ')}.` : ''}`
    })

  const changes = check ? check.rows.reduce((n, r) => n + r.added + r.changed, 0) : 0

  return (
    <section className="page settings">
      <div className="page-head">
        <div>
          <h1>Backup</h1>
          <p className="muted">Download all your data, or restore it from a backup.</p>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Download</h2>
        <p className="muted small">
          A complete backup in one readable JSON file: cards, photos list, transactions, goals, wishlist, valuations and settings.
        </p>
        <label className="check">
          <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
          Include your photos and receipts (larger file)
        </label>
        <div className="sheet-foot">
          <button type="button" className="primary" onClick={() => void onBackup()} disabled={busy}>
            Download backup
          </button>
          <button type="button" onClick={() => void onCsv()} disabled={busy}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Restore</h2>
        <p className="muted small">
          First you see what would change; nothing is written until you confirm. Restoring brings back deleted items and resets changed items to the
          backup. Items added after the backup are kept.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        <div className="sheet-foot">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            Choose backup file
          </button>
        </div>

        {check && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">In backup</th>
                    <th scope="col">Comes back</th>
                    <th scope="col">Reset</th>
                    <th scope="col">Unchanged</th>
                    <th scope="col">Only now (kept)</th>
                  </tr>
                </thead>
                <tbody>
                  {check.rows.map((r) => (
                    <tr key={r.table}>
                      <th scope="row">{r.table.replace(/_/g, ' ')}</th>
                      <td>{r.inBackup}</td>
                      <td>{r.added}</td>
                      <td>{r.changed}</td>
                      <td>{r.same}</td>
                      <td>{r.onlyNow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">{Object.keys(check.backup.files).length} photos and receipts in this backup; only missing ones are uploaded.</p>
            {changes === 0 ? (
              <p className="success">Your current data already matches this backup.</p>
            ) : (
              <div className="sheet-foot">
                {confirm ? (
                  <>
                    <button type="button" className="danger" onClick={() => void onRestore()} disabled={busy}>
                      Confirm restore of {changes} rows
                    </button>
                    <button type="button" className="ghost" onClick={() => setConfirm(false)} disabled={busy}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="primary" onClick={() => setConfirm(true)} disabled={busy}>
                    Restore
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {progress && <p aria-live="polite">{progress}</p>}
      {message && (
        <p className={message.ok ? 'success' : 'error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
