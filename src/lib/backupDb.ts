import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, EXPORT_ONLY_TABLES, prepareRestore, type Backup, type BackupTable, type ExportOnlyTable, type Row } from './backup'
import { fetchAllPages } from './fetchAll'
import { supabase } from './supabase'

/**
 * Tabel bestaat (nog) niet: die SQL-stap is niet gedraaid. Alleen op de foutcode: een tijdelijke 503 "schema cache"
 * (PGRST002) is geen ontbrekende tabel, en zou de tabel anders stil uit de back-up laten.
 */
const missingTable = (code: string | undefined): boolean => code === '42P01' || code === 'PGRST205'

/** Primaire sleutel: vaste volgorde, anders kunnen rijen tussen blokken dubbel in de back-up komen of ontbreken. */
const keyOf = (table: BackupTable): string => (table === 'user_settings' ? 'user_id' : 'id')

/** Alle rijen van een tabel (in blokken); null als de tabel niet bestaat. */
async function fetchAll(table: BackupTable): Promise<Row[] | null> {
  const { data, error } = await fetchAllPages<Row>((from, to) => supabase.from(table).select('*').order(keyOf(table), { ascending: true }).range(from, to))
  if (error) {
    if (missingTable(error.code)) return null
    throw new Error(`Reading ${table} failed: ${error.message}`)
  }
  return data
}

/** Tabellen die alleen meegaan in het bestand (AVG); niet-bestaande of niet-leesbare tabellen worden overgeslagen. */
export async function fetchExportOnly(): Promise<Partial<Record<ExportOnlyTable, Row[]>>> {
  const out: Partial<Record<ExportOnlyTable, Row[]>> = {}
  for (const t of Object.keys(EXPORT_ONLY_TABLES) as ExportOnlyTable[]) {
    const { data, error } = await fetchAllPages<Row>((from, to) => {
      let q = supabase.from(t).select('*')
      for (const col of EXPORT_ONLY_TABLES[t]) q = q.order(col, { ascending: true })
      return q.range(from, to)
    })
    if (error) {
      if (missingTable(error.code)) continue
      throw new Error(`Reading ${t} failed: ${error.message}`)
    }
    out[t] = data
  }
  return out
}

/** Huidige gegevens van alle tabellen die bestaan. */
export async function fetchAllTables(): Promise<Partial<Record<BackupTable, Row[]>>> {
  const tables: Partial<Record<BackupTable, Row[]>> = {}
  for (const t of BACKUP_TABLES) {
    const rows = await fetchAll(t)
    if (rows) tables[t] = rows
  }
  return tables
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function base64ToBlob(b64: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes])
}

/** Opslagbestanden waar de gegevens naar verwijzen: "<bucket>/<pad>". */
function referencedFiles(tables: Partial<Record<BackupTable, Row[]>>): string[] {
  const out: string[] = []
  for (const p of tables.card_photos ?? []) {
    for (const f of ['path', 'thumb_path', 'original_path']) if (typeof p[f] === 'string') out.push(`card-photos/${p[f] as string}`)
  }
  for (const d of tables.transaction_documents ?? []) if (typeof d.path === 'string') out.push(`receipts/${d.path}`)
  return out
}

export type Progress = (message: string) => void

/** Volledige back-up maken; met `withFiles` ook eigen foto's en bewijzen (groter bestand). */
export async function createBackup(withFiles: boolean, onProgress: Progress): Promise<{ backup: Backup; missingFiles: number }> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Not signed in.')
  onProgress('Reading your data…')
  const tables = await fetchAllTables()
  const extra = await fetchExportOnly()
  const files: Record<string, string> = {}
  let missingFiles = 0
  if (withFiles) {
    const list = referencedFiles(tables)
    for (const [i, key] of list.entries()) {
      onProgress(`Adding photos and receipts: ${i + 1} of ${list.length}`)
      const slash = key.indexOf('/')
      const { data, error } = await supabase.storage.from(key.slice(0, slash)).download(key.slice(slash + 1))
      if (error || !data) {
        missingFiles += 1
        console.warn(`Bestand ${key} niet gevonden`, error)
        continue
      }
      files[key] = await blobToBase64(data)
    }
  }
  return {
    backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), user_id: auth.user.id, tables, extra, files },
    missingFiles,
  }
}

async function upsertRows(table: BackupTable, rows: Row[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict })
    if (error) throw new Error(`Restoring ${table} failed: ${error.message}`)
  }
}

export interface RestoreResult {
  rows: Partial<Record<BackupTable, number>>
  files: number
  skippedTables: BackupTable[]
}

/**
 * Herstellen: rijen terugzetten op hun id (verwijderde komen terug, gewijzigde krijgen de back-upwaarden;
 * wat na de back-up is toegevoegd blijft staan), bestanden alleen als ze ontbreken.
 */
export async function restoreBackup(backup: Backup, onProgress: Progress): Promise<RestoreResult> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Not signed in.')
  const { tables, files } = prepareRestore(backup, auth.user.id)
  const result: RestoreResult = { rows: {}, files: 0, skippedTables: [] }

  const fileKeys = Object.keys(files)
  for (const [i, key] of fileKeys.entries()) {
    onProgress(`Restoring photos and receipts: ${i + 1} of ${fileKeys.length}`)
    const slash = key.indexOf('/')
    const { error } = await supabase.storage.from(key.slice(0, slash)).upload(key.slice(slash + 1), base64ToBlob(files[key]), { upsert: false })
    if (!error) result.files += 1
    else if (!/exists|duplicate/i.test(error.message)) throw new Error(`Restoring a file failed: ${error.message}`)
  }

  for (const t of BACKUP_TABLES) {
    const rows = tables[t]
    if (!rows || rows.length === 0) continue
    onProgress(`Restoring ${t.replace(/_/g, ' ')}…`)
    // Bestaat de tabel niet (SQL-stap niet gedraaid), dan overslaan en melden.
    const probe = await supabase.from(t).select('*').limit(1)
    if (probe.error && missingTable(probe.error.code)) {
      result.skippedTables.push(t)
      continue
    }
    if (t === 'cards') {
      // Eerst zonder onderlinge verwijzing, daarna split_from terugzetten.
      await upsertRows(t, rows.map((r) => ({ ...r, split_from: null })), 'id')
      const linked = rows.filter((r) => typeof r.split_from === 'string')
      for (const r of linked) {
        const { error } = await supabase.from('cards').update({ split_from: r.split_from }).eq('id', r.id as string)
        if (error) throw new Error(`Restoring cards failed: ${error.message}`)
      }
    } else if (t === 'user_settings') {
      await upsertRows(t, rows.slice(0, 1), 'user_id')
    } else if (t === 'collection_goals') {
      // Eén doel per set: bestaand doel voor dezelfde set krijgt de back-upinstellingen.
      await upsertRows(t, rows.map(({ id: _id, ...rest }) => (void _id, rest)), 'user_id,lang,set_id')
    } else {
      await upsertRows(t, rows, 'id')
    }
    result.rows[t] = rows.length
  }
  return result
}

/** Bestand aanbieden om op te slaan. */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
