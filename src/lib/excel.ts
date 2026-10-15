import type { CellValue, Workbook, Worksheet } from 'exceljs'
import { langFromName, stripLangTag } from './tcgdex'
import { EMPTY_CARD, type CardInput, type CardLanguage, type ItemKind } from './types'

export interface ParseResult {
  cards: CardInput[]
  warnings: string[]
}

const FIRST_DATA_ROW = 3

/** Bekende kanalen, hoofdletterongevoelig gelijkgetrokken. */
const CHANNELS: Record<string, string> = {
  cardmarket: 'Cardmarket',
  whatsapp: 'WhatsApp',
  'bol.com': 'Bol.com',
  catchyourcards: 'CatchYourCards',
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('richText' in value) return value.richText.map((r) => r.text).join('').trim()
  if ('hyperlink' in value) return value.text.trim()
  if ('result' in value) return value.result === undefined ? '' : cellText(value.result as CellValue)
  return ''
}

export function normalizeChannel(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  return CHANNELS[t.toLowerCase()] ?? t
}

/** "3x", "3", " 3 x" → 3. Ongeldig → null. */
export function parseQuantity(raw: string): number | null {
  const m = /^\s*(\d+)\s*x?\s*$/i.exec(raw)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 ? n : null
}

/** Accepteert 5.95 en "5,95"; rondt af op centen. */
export function parsePrice(raw: string): number | null {
  const t = raw.replace(',', '.').replace(/[€\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

function parseBool(value: CellValue): boolean {
  if (typeof value === 'boolean') return value
  const t = cellText(value).toLowerCase()
  return t === 'true' || t === '1' || t === 'waar' || t === 'ja'
}

interface ExcelRow {
  row: number
  name: string
  set_code: string | null
  card_number: string | null
  quantity: number
  price: number
  channel: string | null
  kind: ItemKind
}

/** "Mew EX JAPAN" → naam "Mew EX" + taal "ja". Losse kaarten zonder markering zijn Engels. */
export function splitLanguage(rawName: string, kind: ItemKind): { name: string; language: CardLanguage | null } {
  if (kind === 'sealed') return { name: rawName, language: null }
  return { name: stripLangTag(rawName), language: langFromName(rawName) }
}

function readRows(ws: Worksheet, label: string, warnings: string[]): ExcelRow[] {
  const out: ExcelRow[] = []
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const name = cellText(row.getCell(1).value)
    if (!name) continue

    const setRaw = cellText(row.getCell(2).value)
    const numberRaw = cellText(row.getCell(3).value)
    const qty = parseQuantity(cellText(row.getCell(4).value))
    const price = parsePrice(cellText(row.getCell(5).value))
    if (qty === null) {
      warnings.push(`${label} rij ${r} (${name}): ongeldig aantal, overgeslagen.`)
      continue
    }
    if (price === null) {
      warnings.push(`${label} rij ${r} (${name}): ongeldige prijs, overgeslagen.`)
      continue
    }
    // Set "x" in de Excel = sealed product (booster box e.d.).
    const sealed = setRaw.toLowerCase() === 'x'
    out.push({
      row: r,
      name,
      set_code: sealed || !setRaw ? null : setRaw,
      card_number: sealed || !numberRaw || numberRaw.toLowerCase() === 'x' ? null : numberRaw,
      quantity: qty,
      price,
      channel: normalizeChannel(cellText(row.getCell(6).value)),
      kind: sealed ? 'sealed' : 'card',
    })
  }
  return out
}

function sheet(wb: Workbook, name: string): Worksheet {
  const ws = wb.getWorksheet(name)
  if (!ws) throw new Error(`Tabblad "${name}" niet gevonden in het Excel-bestand.`)
  return ws
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  // Typedefinitie vraagt een Node Buffer; de browserbuild accepteert een ArrayBuffer.
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0])

  const warnings: string[] = []
  const soldSheet = sheet(wb, 'Sold')
  const base = (r: ExcelRow, sortOrder: number): CardInput => ({
    ...EMPTY_CARD,
    ...splitLanguage(r.name, r.kind),
    set_code: r.set_code,
    card_number: r.card_number,
    quantity: r.quantity,
    kind: r.kind,
    sort_order: sortOrder,
  })
  // Verkooplijst → te koop / verkocht; aankooplijst → in collectie (zelfde mapping als 003_migrate_to_cards.sql).
  const sales: CardInput[] = readRows(soldSheet, 'Sold', warnings).map((r, i) => ({
    ...base(r, i),
    status: parseBool(soldSheet.getRow(r.row).getCell(7).value) ? 'sold' : 'for_sale',
    sale_price: r.price,
    sale_channel: r.channel,
  }))
  const purchases: CardInput[] = readRows(sheet(wb, 'Bought'), 'Bought', warnings).map((r, i) => ({
    ...base(r, 1000 + i),
    status: 'collection',
    purchase_price: r.price,
    purchase_channel: r.channel,
  }))
  return { cards: [...sales, ...purchases], warnings }
}
