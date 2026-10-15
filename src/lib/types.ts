export type ItemKind = 'card' | 'sealed'
export type CardStatus = 'collection' | 'for_sale' | 'sold'
export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'
export type Variant = 'normal' | 'holo' | 'reverse' | 'firstEdition'
export type GradingCompany = 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'TAG' | 'other'
export type CardLanguage = 'en' | 'ja' | 'zh-cn' | 'zh-tw' | 'ko' | 'nl' | 'de' | 'fr' | 'it' | 'es' | 'pt'
/** Bezit van de exemplaren in een regel. */
export type Ownership = 'incoming' | 'owned' | 'sold' | 'traded' | 'given_away'
/** Beschikbaarheid zolang je ze bezit. */
export type Availability = 'keep' | 'for_sale' | 'reserved'
/** Kwaliteit van de koppeling met de catalogus (TCGdex). */
export type LinkStatus = 'exact' | 'approximate' | 'unconfirmed' | 'manual'
export type PhotoLabel = 'front' | 'back' | 'detail' | 'damage' | 'slab' | 'scan' | 'other'

export const STATUS_LABELS: Record<CardStatus, string> = {
  collection: 'In collection',
  for_sale: 'For sale',
  sold: 'Sold',
}

export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  incoming: 'Incoming',
  owned: 'Owned',
  sold: 'Sold',
  traded: 'Traded',
  given_away: 'Given away',
}

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  keep: 'Keep',
  for_sale: 'For sale',
  reserved: 'Reserved',
}

export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  exact: 'Exact match',
  approximate: 'Approximate match',
  unconfirmed: 'Not confirmed',
  manual: 'Chosen by you',
}

export const PHOTO_LABELS: Record<PhotoLabel, string> = {
  front: 'Front',
  back: 'Back',
  detail: 'Detail',
  damage: 'Damage',
  slab: 'Slab',
  scan: 'Scan',
  other: 'Other',
}

/** Nog in bezit (of onderweg naar je toe). */
export const isHeld = (o: Ownership): boolean => o === 'owned' || o === 'incoming'

/** Oude, enkelvoudige status; zelfde regel als de databasetrigger `cards_sync_status`. */
export function deriveStatus(ownership: Ownership, availability: Availability): CardStatus {
  if (!isHeld(ownership)) return 'sold'
  return availability === 'keep' ? 'collection' : 'for_sale'
}

/** Omgekeerd: bezit en beschikbaarheid uit de oude status (rijen van vóór STAP4). */
export function fromStatus(status: CardStatus): { ownership: Ownership; availability: Availability } {
  if (status === 'sold') return { ownership: 'sold', availability: 'keep' }
  return { ownership: 'owned', availability: status === 'for_sale' ? 'for_sale' : 'keep' }
}

/** Status plus de bijbehorende bezit- en beschikbaarheidsvelden, voor plekken die in de oude status denken. */
export function statusFields(status: CardStatus): { status: CardStatus; ownership: Ownership; availability: Availability } {
  return { status, ...fromStatus(status) }
}

/** Snelle wissel te koop ↔ verkocht: alleen bij gewoon te koop of verkocht (niet onderweg, gereserveerd, geruild). */
export function canToggleSold(c: Pick<CardInput, 'ownership' | 'availability'>): boolean {
  return (c.ownership === 'owned' && c.availability === 'for_sale') || c.ownership === 'sold'
}

/** Korte statustekst voor badges; null = gewoon in bezit, niets te melden. */
export function statusBadge(c: Pick<CardInput, 'ownership' | 'availability'>): string | null {
  if (c.ownership !== 'owned') return OWNERSHIP_LABELS[c.ownership]
  return c.availability === 'keep' ? null : AVAILABILITY_LABELS[c.availability]
}

/** Cardmarket-schaal. */
export const CONDITION_LABELS: Record<Condition, string> = {
  MT: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Light Played',
  PL: 'Played',
  PO: 'Poor',
}

export const VARIANT_LABELS: Record<Variant, string> = {
  normal: 'Normal',
  holo: 'Holo',
  reverse: 'Reverse holo',
  firstEdition: '1st edition',
}

export const GRADING_LABELS: Record<GradingCompany, string> = {
  PSA: 'PSA',
  CGC: 'CGC',
  BGS: 'BGS (Beckett)',
  SGC: 'SGC',
  TAG: 'TAG',
  other: 'Other',
}

export const LANGUAGE_LABELS: Record<CardLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
  'zh-cn': 'Chinese (simplified)',
  'zh-tw': 'Chinese (traditional)',
  ko: 'Korean',
  nl: 'Dutch',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  es: 'Spanish',
  pt: 'Portuguese',
}

/** Eén regel in je voorraad (zonder database-velden). */
export interface CardInput {
  name: string
  set_code: string | null
  card_number: string | null
  quantity: number
  kind: ItemKind
  tcgdex_id: string | null
  /** Afgeleid van ownership + availability (zie deriveStatus); blijft voor oudere app-versies. */
  status: CardStatus
  ownership: Ownership
  availability: Availability
  language: CardLanguage | null
  condition: Condition | null
  variant: Variant | null
  grading_company: GradingCompany | null
  grade: number | null
  purchase_price: number | null
  purchase_channel: string | null
  purchase_date: string | null
  sale_price: number | null
  sale_channel: string | null
  sale_date: string | null
  /** Oude enkele eigen foto (STAP3); sinds STAP4 staan foto's in card_photos. */
  image_path: string | null
  notes: string | null
  /** Certificaatnummer bij grading. */
  cert_number: string | null
  /** Druk of stempel, bv. "Staff stamp". */
  edition: string | null
  link_status: LinkStatus | null
  /** Cardmarket-product-ID (extern), los van onze eigen id. */
  cardmarket_id: number | null
  location_id: string | null
  location_page: number | null
  location_slot: number | null
  import_batch_id: string | null
  sort_order: number
}

export const EMPTY_CARD: CardInput = {
  name: '',
  set_code: null,
  card_number: null,
  quantity: 1,
  kind: 'card',
  tcgdex_id: null,
  status: 'collection',
  ownership: 'owned',
  availability: 'keep',
  language: null,
  condition: null,
  variant: null,
  grading_company: null,
  grade: null,
  purchase_price: null,
  purchase_channel: null,
  purchase_date: null,
  sale_price: null,
  sale_channel: null,
  sale_date: null,
  image_path: null,
  notes: null,
  cert_number: null,
  edition: null,
  link_status: null,
  cardmarket_id: null,
  location_id: null,
  location_page: null,
  location_slot: null,
  import_batch_id: null,
  sort_order: 0,
}

/** Eigen foto van een kaartregel (tabel card_photos). */
export interface CardPhoto {
  id: string
  card_id: string | null
  path: string
  thumb_path: string | null
  label: PhotoLabel
  is_primary: boolean
  created_at: string
}

export interface Card extends CardInput {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  /** Eigen foto's (leeg vóór STAP4 of als er geen zijn). */
  photos: CardPhoto[]
}

/** Hoofdfoto: de gemarkeerde, anders de oudste; null als er geen is. */
export function primaryPhoto(c: Pick<Card, 'photos'>): CardPhoto | null {
  return c.photos.find((p) => p.is_primary) ?? c.photos[0] ?? null
}
