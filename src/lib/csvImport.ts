import { parsePrice, parseQuantity } from './excel'
import { EMPTY_CARD, type CardInput, type CardLanguage, type Condition, type GradingCompany, type Variant } from './types'

/** Velden waar een CSV-kolom aan gekoppeld kan worden. */
export const IMPORT_FIELDS = {
  name: 'Name',
  set_code: 'Set',
  card_number: 'Number',
  quantity: 'Quantity',
  language: 'Language',
  variant: 'Variant',
  condition: 'Condition',
  edition: 'Edition or stamp',
  grading_company: 'Grading company',
  grade: 'Grade',
  purchase_price: 'Purchase price (each)',
  purchase_date: 'Purchase date',
  purchase_channel: 'Purchase channel',
  notes: 'Notes',
} as const
export type ImportField = keyof typeof IMPORT_FIELDS

/** Kolom-index per veld; ontbreekt = niet gekoppeld. */
export type Mapping = Partial<Record<ImportField, number>>

const norm = (s: string): string => s.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')

const SYNONYMS: Record<ImportField, readonly string[]> = {
  name: ['name', 'naam', 'card', 'card name', 'kaart', 'kaartnaam', 'product', 'product name'],
  set_code: ['set', 'set code', 'setcode', 'expansion', 'serie', 'set name'],
  card_number: ['number', 'nummer', 'no', 'nr', '#', 'card number', 'kaartnummer', 'collector number'],
  quantity: ['quantity', 'qty', 'aantal', 'count', 'amount', 'stuks'],
  language: ['language', 'taal', 'lang'],
  variant: ['variant', 'finish', 'foil', 'printing', 'uitvoering'],
  condition: ['condition', 'conditie', 'staat', 'cond'],
  edition: ['edition', 'stamp', 'druk', 'stempel'],
  grading_company: ['grading', 'grading company', 'grader', 'graded by'],
  grade: ['grade', 'cijfer', 'score'],
  purchase_price: ['price', 'prijs', 'purchase price', 'aankoopprijs', 'cost', 'kosten', 'paid', 'betaald'],
  purchase_date: ['date', 'datum', 'purchase date', 'aankoopdatum', 'bought on'],
  purchase_channel: ['channel', 'kanaal', 'source', 'bron', 'shop', 'winkel', 'seller', 'verkoper'],
  notes: ['notes', 'note', 'notities', 'opmerking', 'opmerkingen', 'comment', 'comments'],
}

/** Kolommen automatisch koppelen op kolomnaam (Engels en Nederlands); elke kolom hooguit één keer. */
export function guessMapping(headers: readonly string[]): Mapping {
  const mapping: Mapping = {}
  const used = new Set<number>()
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && SYNONYMS[field].includes(norm(h)))
    if (i >= 0) {
      mapping[field] = i
      used.add(i)
    }
  }
  return mapping
}

const LANGUAGES: Record<string, CardLanguage> = {
  en: 'en', english: 'en', engels: 'en', eng: 'en',
  ja: 'ja', jp: 'ja', jap: 'ja', japanese: 'ja', japans: 'ja',
  'zh cn': 'zh-cn', 'zh-cn': 'zh-cn', 'chinese (simplified)': 'zh-cn', 'simplified chinese': 'zh-cn', chinese: 'zh-cn', chinees: 'zh-cn',
  'zh tw': 'zh-tw', 'zh-tw': 'zh-tw', 'chinese (traditional)': 'zh-tw', 'traditional chinese': 'zh-tw',
  ko: 'ko', kr: 'ko', korean: 'ko', koreaans: 'ko',
  nl: 'nl', dutch: 'nl', nederlands: 'nl',
  de: 'de', german: 'de', duits: 'de',
  fr: 'fr', french: 'fr', frans: 'fr',
  it: 'it', italian: 'it', italiaans: 'it',
  es: 'es', spanish: 'es', spaans: 'es',
  pt: 'pt', portuguese: 'pt', portugees: 'pt',
}

const VARIANTS: Record<string, Variant> = {
  normal: 'normal', normaal: 'normal', regular: 'normal', 'non holo': 'normal', nonholo: 'normal',
  holo: 'holo', holofoil: 'holo', foil: 'holo',
  reverse: 'reverse', 'reverse holo': 'reverse', 'reverse holofoil': 'reverse', rh: 'reverse', 'reverse foil': 'reverse',
  '1st edition': 'firstEdition', 'first edition': 'firstEdition', '1st': 'firstEdition', '1e editie': 'firstEdition',
}

const CONDITIONS: Record<string, Condition> = {
  mt: 'MT', mint: 'MT',
  nm: 'NM', 'near mint': 'NM',
  ex: 'EX', excellent: 'EX',
  gd: 'GD', good: 'GD', 'good (gd)': 'GD',
  lp: 'LP', 'light played': 'LP', 'lightly played': 'LP',
  pl: 'PL', played: 'PL', 'moderately played': 'PL',
  po: 'PO', poor: 'PO', damaged: 'PO',
}

const GRADERS: Record<string, GradingCompany> = { psa: 'PSA', cgc: 'CGC', bgs: 'BGS', beckett: 'BGS', sgc: 'SGC', tag: 'TAG' }

/** Datum als jjjj-mm-dd, dd-mm-jjjj of dd/mm/jjjj → jjjj-mm-dd; ongeldig → null. */
export function parseDate(raw: string): string | null {
  const t = raw.trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else {
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t)
    if (!match) return null
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface ImportDraft {
  /** Regelnummer in het bestand (1 = eerste regel na de kopregel). */
  line: number
  input: CardInput
  /** Waarden die niet te lezen waren (veld blijft dan leeg); de regel wordt wel getoond. */
  problems: string[]
  /** Geen naam: kan niet worden geïmporteerd (wel getoond, niet stil overgeslagen). */
  invalid: boolean
}

/** CSV-regels omzetten met de gekozen koppeling. Niets wordt stil overgeslagen. */
export function rowsToDrafts(rows: readonly string[][], mapping: Mapping): ImportDraft[] {
  return rows.map((row, idx) => {
    const problems: string[] = []
    const cell = (f: ImportField): string => {
      const i = mapping[f]
      return i === undefined ? '' : (row[i] ?? '').trim()
    }
    const lookup = <T,>(f: ImportField, table: Record<string, T>): T | null => {
      const v = cell(f)
      if (!v) return null
      const hit = table[norm(v)] ?? table[v.toLowerCase()]
      if (hit === undefined) problems.push(`${IMPORT_FIELDS[f]} "${v}" not recognised`)
      return hit ?? null
    }
    const name = cell('name')
    let quantity = 1
    if (cell('quantity')) {
      const q = parseQuantity(cell('quantity'))
      if (q === null || q < 1 || q > 9999) problems.push(`Quantity "${cell('quantity')}" not recognised, 1 used`)
      else quantity = q
    }
    let price: number | null = null
    if (cell('purchase_price')) {
      price = parsePrice(cell('purchase_price'))
      if (price === null) problems.push(`Price "${cell('purchase_price')}" not recognised`)
    }
    let date: string | null = null
    if (cell('purchase_date')) {
      date = parseDate(cell('purchase_date'))
      if (date === null) problems.push(`Date "${cell('purchase_date')}" not recognised`)
    }
    const grader = lookup('grading_company', GRADERS)
    let grade: number | null = null
    if (cell('grade')) {
      const g = Number(cell('grade').replace(',', '.'))
      if (Number.isFinite(g) && g >= 1 && g <= 10 && (g * 2) % 1 === 0) grade = g
      else problems.push(`Grade "${cell('grade')}" not recognised`)
    }
    const graded = grader !== null && grade !== null
    if ((grader !== null) !== (grade !== null)) problems.push('Grading needs both company and grade; left empty')
    const input: CardInput = {
      ...EMPTY_CARD,
      name: name.slice(0, 200),
      set_code: cell('set_code').slice(0, 20) || null,
      card_number: cell('card_number').replace(/^#/, '').slice(0, 20) || null,
      quantity,
      language: lookup('language', LANGUAGES),
      variant: lookup('variant', VARIANTS),
      condition: lookup('condition', CONDITIONS),
      edition: cell('edition').slice(0, 60) || null,
      grading_company: graded ? grader : null,
      grade: graded ? grade : null,
      purchase_price: price,
      purchase_date: date,
      purchase_channel: cell('purchase_channel').slice(0, 50) || null,
      notes: cell('notes').slice(0, 2000) || null,
    }
    return { line: idx + 1, input, problems, invalid: !name }
  })
}

/** Sleutel voor "dezelfde uitvoering": naam, set, nummer, variant, taal (hoofdletterongevoelig). */
export function duplicateKey(c: Pick<CardInput, 'name' | 'set_code' | 'card_number' | 'variant' | 'language'>): string {
  const num = (c.card_number ?? '').replace(/^0+(?=\d)/, '')
  return [c.name, c.set_code ?? '', num, c.variant ?? '', c.language ?? ''].map((s) => s.trim().toLowerCase()).join('|')
}

/**
 * Mogelijke duplicaten: dezelfde uitvoering staat al in je collectie of eerder in het bestand.
 * Alleen een melding: meerdere gelijke exemplaren zijn legitiem, jij beslist.
 */
export function findDuplicates(drafts: readonly ImportDraft[], existing: readonly CardInput[]): Map<number, 'collection' | 'file'> {
  const owned = new Set(existing.map(duplicateKey))
  const seen = new Set<string>()
  const out = new Map<number, 'collection' | 'file'>()
  for (const d of drafts) {
    if (d.invalid) continue
    const key = duplicateKey(d.input)
    if (owned.has(key)) out.set(d.line, 'collection')
    else if (seen.has(key)) out.set(d.line, 'file')
    seen.add(key)
  }
  return out
}
