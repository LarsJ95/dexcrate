/** Back-upformaat: alle eigen gegevens in één leesbaar JSON-bestand, optioneel met eigen foto's en bewijzen. */

export const BACKUP_FORMAT = 'dexcrate-backup'
export const BACKUP_VERSION = 1

/** Tabellen in herstelvolgorde (verwijzingen eerst). */
export const BACKUP_TABLES = [
  'locations',
  'binder_slots',
  'import_batches',
  'cards',
  'card_photos',
  'transactions',
  'transaction_lines',
  'transaction_documents',
  'valuations',
  'collection_goals',
  'wishlist_items',
  'user_settings',
  'scan_sessions',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

export type Row = Record<string, unknown>

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  /** Gebruiker op het moment van exporteren (voor het omzetten van opslagpaden bij herstel in een ander account). */
  user_id: string
  tables: Partial<Record<BackupTable, Row[]>>
  /** Bestanden: "<bucket>/<pad>" → base64-inhoud. */
  files: Record<string, string>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Back-upbestand controleren; geeft een duidelijke fout bij een verkeerd of beschadigd bestand. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) throw new Error('This is not a Dexcrate backup file.')
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app.')
  }
  if (typeof data.user_id !== 'string' || !isRecord(data.tables)) throw new Error('The backup file is incomplete.')
  const tables: Backup['tables'] = {}
  for (const t of BACKUP_TABLES) {
    const rows = data.tables[t]
    if (rows === undefined) continue
    if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error(`The backup file is damaged (table ${t}).`)
    tables[t] = rows
  }
  const files: Record<string, string> = {}
  if (isRecord(data.files)) {
    for (const [k, v] of Object.entries(data.files)) if (typeof v === 'string') files[k] = v
  }
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    exported_at: typeof data.exported_at === 'string' ? data.exported_at : '',
    user_id: data.user_id,
    tables,
    files,
  }
}

/** Velden met een opslagpad, per tabel. */
const PATH_FIELDS: Partial<Record<BackupTable, readonly string[]>> = {
  card_photos: ['path', 'thumb_path', 'original_path'],
  transaction_documents: ['path'],
}

const swapPrefix = (path: string, from: string, to: string): string => (path.startsWith(`${from}/`) ? `${to}/${path.slice(from.length + 1)}` : path)

/**
 * Klaarmaken voor herstel in (mogelijk) een ander account: user_id wordt de huidige gebruiker en
 * opslagpaden krijgen diens map (de opslag staat alleen je eigen map toe).
 */
export function prepareRestore(backup: Backup, userId: string): { tables: Backup['tables']; files: Record<string, string> } {
  const tables: Backup['tables'] = {}
  for (const t of BACKUP_TABLES) {
    const rows = backup.tables[t]
    if (!rows) continue
    const fields = PATH_FIELDS[t] ?? []
    tables[t] = rows.map((r) => {
      const out: Row = { ...r, user_id: userId }
      for (const f of fields) if (typeof out[f] === 'string') out[f] = swapPrefix(out[f] as string, backup.user_id, userId)
      return out
    })
  }
  const files: Record<string, string> = {}
  for (const [key, value] of Object.entries(backup.files)) {
    const slash = key.indexOf('/')
    files[`${key.slice(0, slash)}/${swapPrefix(key.slice(slash + 1), backup.user_id, userId)}`] = value
  }
  return { tables, files }
}

/** Per tabel: hoeveel rijen nieuw zijn, gewijzigd of gelijk ten opzichte van de huidige gegevens. */
export function compareTables(
  backup: Backup['tables'],
  current: Partial<Record<BackupTable, Row[]>>,
): { table: BackupTable; inBackup: number; added: number; changed: number; same: number; onlyNow: number }[] {
  const ignore = new Set(['updated_at', 'user_id'])
  const key = (t: BackupTable, r: Row): string => String(t === 'user_settings' ? 'settings' : r.id)
  const comparable = (r: Row): string =>
    JSON.stringify(
      Object.keys(r)
        .filter((k) => !ignore.has(k))
        .sort()
        .map((k) => [k, r[k]]),
    )
  return BACKUP_TABLES.filter((t) => backup[t] || current[t]).map((t) => {
    const now = new Map((current[t] ?? []).map((r) => [key(t, r), comparable(r)]))
    let added = 0
    let changed = 0
    let same = 0
    const rows = backup[t] ?? []
    for (const r of rows) {
      const cur = now.get(key(t, r))
      if (cur === undefined) added += 1
      else if (cur === comparable(r)) same += 1
      else changed += 1
    }
    const inBackup = new Set(rows.map((r) => key(t, r)))
    const onlyNow = [...now.keys()].filter((k) => !inBackup.has(k)).length
    return { table: t, inBackup: rows.length, added, changed, same, onlyNow }
  })
}

// --- CSV ---

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v) || isRecord(v) ? JSON.stringify(v) : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV (komma's, UTF-8 met BOM zodat Excel accenten goed toont); kolommen in vaste volgorde. */
export function toCsv(rows: readonly Row[], columns: readonly string[]): string {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

/** RFC 4180-CSV inlezen (aanhalingstekens, regeleinden binnen velden); scheidingsteken komma of puntkomma. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}
