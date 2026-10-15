export type ItemKind = 'card' | 'sealed'
export type CardStatus = 'collection' | 'for_sale' | 'sold'
export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'
export type Variant = 'normal' | 'holo' | 'reverse' | 'firstEdition'
export type GradingCompany = 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'TAG' | 'other'
export type CardLanguage = 'en' | 'ja' | 'zh-cn' | 'zh-tw' | 'ko' | 'nl' | 'de' | 'fr' | 'it' | 'es' | 'pt'

export const STATUS_LABELS: Record<CardStatus, string> = {
  collection: 'In collectie',
  for_sale: 'Te koop',
  sold: 'Verkocht',
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
  normal: 'Normaal',
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
  other: 'Anders',
}

export const LANGUAGE_LABELS: Record<CardLanguage, string> = {
  en: 'Engels',
  ja: 'Japans',
  'zh-cn': 'Chinees (vereenvoudigd)',
  'zh-tw': 'Chinees (traditioneel)',
  ko: 'Koreaans',
  nl: 'Nederlands',
  de: 'Duits',
  fr: 'Frans',
  it: 'Italiaans',
  es: 'Spaans',
  pt: 'Portugees',
}

/** Eén regel in je voorraad (zonder database-velden). */
export interface CardInput {
  name: string
  set_code: string | null
  card_number: string | null
  quantity: number
  kind: ItemKind
  tcgdex_id: string | null
  status: CardStatus
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
  sort_order: 0,
}

export interface Card extends CardInput {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}
