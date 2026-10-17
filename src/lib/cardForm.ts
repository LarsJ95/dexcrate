// Formulierstatus en controle van het kaartformulier (CardForm); los van React, zodat het te testen is.
import { normalizeChannel, parsePrice } from './excel'
import {
  deriveStatus,
  fromStatus,
  isHeld,
  type Availability,
  type CardInput,
  type CardLanguage,
  type CardStatus,
  type Condition,
  type GradingCompany,
  type ItemKind,
  type LinkStatus,
  type Ownership,
  type Variant,
} from './types'

export interface FormState {
  name: string
  set_code: string
  card_number: string
  quantity: string
  kind: ItemKind
  tcgdex_id: string | null
  link_status: LinkStatus | null
  ownership: Ownership
  availability: Availability
  language: CardLanguage | ''
  condition: Condition | ''
  variant: Variant | ''
  grading_company: GradingCompany | ''
  grade: string
  purchase_price: string
  purchase_channel: string
  purchase_date: string
  sale_price: string
  sale_channel: string
  sale_date: string
  notes: string
  edition: string
  cert_number: string
  location_id: string
  location_page: string
  location_slot: string
}

export const MAX_QTY = 9999
const MAX_PRICE = 1_000_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const priceText = (n: number | null): string => (n === null ? '' : n.toFixed(2))
export const today = (): string => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in lokale tijd

export function initialState(src: CardInput | null, status: CardStatus): FormState {
  // Gevraagde status gelijk aan de huidige: bezit en beschikbaarheid ongemoeid laten (bv. onderweg, gereserveerd).
  const start = src && src.status === status ? { ownership: src.ownership, availability: src.availability } : fromStatus(status)
  return {
    name: src?.name ?? '',
    set_code: src?.set_code ?? '',
    card_number: src?.card_number ?? '',
    quantity: String(src?.quantity ?? 1),
    kind: src?.kind ?? 'card',
    tcgdex_id: src?.tcgdex_id ?? null,
    link_status: src?.link_status ?? null,
    ...start,
    language: src ? (src.language ?? '') : 'en',
    condition: src?.condition ?? '',
    variant: src?.variant ?? '',
    grading_company: src?.grading_company ?? '',
    grade: src?.grade === null || src?.grade === undefined ? '' : String(src.grade),
    purchase_price: priceText(src?.purchase_price ?? null),
    purchase_channel: src?.purchase_channel ?? '',
    purchase_date: src?.purchase_date ?? '',
    sale_price: priceText(src?.sale_price ?? null),
    sale_channel: src?.sale_channel ?? '',
    sale_date: start.ownership === 'sold' && !src?.sale_date ? today() : (src?.sale_date ?? ''),
    notes: src?.notes ?? '',
    edition: src?.edition ?? '',
    cert_number: src?.cert_number ?? '',
    location_id: src?.location_id ?? '',
    location_page: src?.location_page ? String(src.location_page) : '',
    location_slot: src?.location_slot ? String(src.location_slot) : '',
  }
}

/** Velden die het formulier niet toont; bij een nieuwe regel overgenomen uit de bron. */
type Untouched = 'sort_order' | 'image_path' | 'cardmarket_id' | 'import_batch_id'

// Foto wordt niet in het formulier bewerkt; bij bijwerken blijft image_path ongemoeid.
type Validated = { error: string } | { value: Omit<CardInput, Untouched> }

function optionalPrice(raw: string, label: string): { error: string } | { value: number | null } {
  if (!raw.trim()) return { value: null }
  const p = parsePrice(raw)
  if (p === null || p > MAX_PRICE) return { error: `Enter a valid ${label}, e.g. 4.95.` }
  return { value: p }
}

export function validate(f: FormState): Validated {
  const name = f.name.trim()
  if (!name) return { error: 'Enter a name.' }
  if (name.length > 200) return { error: 'Name is too long (max. 200 characters).' }
  const qty = Number(f.quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `Quantity must be a whole number from 1 to ${MAX_QTY}.` }
  const setCode = f.set_code.trim()
  const number = f.card_number.trim()
  if (setCode.length > 20 || number.length > 20) return { error: 'Set and number can be at most 20 characters.' }

  const purchase = optionalPrice(f.purchase_price, 'purchase price')
  if ('error' in purchase) return purchase
  // Een onbekende verkoop- of vraagprijs mag leeg blijven: onbekend is niet 0.
  const sale = optionalPrice(f.sale_price, f.ownership === 'sold' ? 'sale price' : 'asking price')
  if ('error' in sale) return sale
  const notes = f.notes.trim()
  if (notes.length > 2000) return { error: 'Notes can be at most 2000 characters.' }
  const edition = f.edition.trim()
  if (edition.length > 60) return { error: 'Edition or stamp can be at most 60 characters.' }
  const cert = f.cert_number.trim()
  if (cert.length > 40) return { error: 'Certificate number can be at most 40 characters.' }
  const page = f.location_id && f.location_page.trim() ? Number(f.location_page) : null
  const pocket = f.location_id && f.location_slot.trim() ? Number(f.location_slot) : null
  if (page !== null && (!Number.isInteger(page) || page < 1 || page > 999)) return { error: 'Page must be a whole number from 1 to 999.' }
  if (pocket !== null && (!Number.isInteger(pocket) || pocket < 1 || pocket > 99)) return { error: 'Pocket must be a whole number from 1 to 99.' }

  let grade: number | null = null
  if (f.grading_company || f.grade.trim()) {
    grade = Number(f.grade.replace(',', '.'))
    if (!f.grading_company) return { error: 'Choose the grading company.' }
    if (!f.grade.trim() || !Number.isFinite(grade) || grade < 1 || grade > 10 || (grade * 2) % 1 !== 0) {
      return { error: 'Grade must be between 1 and 10 (half points allowed).' }
    }
  }

  for (const d of [f.purchase_date, f.sale_date]) {
    if (d && !DATE_RE.test(d)) return { error: 'Invalid date.' }
  }
  const purchaseChannel = normalizeChannel(f.purchase_channel)
  const saleChannel = normalizeChannel(f.sale_channel)
  if ((purchaseChannel?.length ?? 0) > 50 || (saleChannel?.length ?? 0) > 50) return { error: 'Channel is too long (max. 50 characters).' }

  const sealed = f.kind === 'sealed'
  const status = deriveStatus(f.ownership, f.availability)
  // Vraagprijs (te koop/gereserveerd) of verkoopprijs (verkocht); bij ruil of weggeven geen prijs.
  const hasSale = f.ownership === 'sold' || (isHeld(f.ownership) && f.availability !== 'keep')
  return {
    value: {
      name,
      set_code: sealed || !setCode ? null : setCode,
      card_number: sealed || !number ? null : number,
      quantity: qty,
      kind: f.kind,
      tcgdex_id: sealed ? null : f.tcgdex_id,
      link_status: sealed || !f.tcgdex_id ? null : f.link_status,
      status,
      ownership: f.ownership,
      availability: isHeld(f.ownership) ? f.availability : 'keep',
      language: sealed ? null : f.language || null,
      condition: f.condition || null,
      variant: sealed ? null : f.variant || null,
      grading_company: sealed ? null : f.grading_company || null,
      grade: sealed ? null : grade,
      purchase_price: purchase.value,
      purchase_channel: purchaseChannel,
      purchase_date: f.purchase_date || null,
      // Verkoopgegevens alleen bewaren als de kaart te koop staat of verkocht is.
      sale_price: hasSale ? sale.value : null,
      sale_channel: hasSale ? saleChannel : null,
      sale_date: f.ownership === 'sold' ? f.sale_date || null : null,
      notes: notes || null,
      edition: sealed || !edition ? null : edition,
      cert_number: sealed || !f.grading_company || !cert ? null : cert,
      location_id: f.location_id || null,
      location_page: page,
      location_slot: pocket,
    },
  }
}
