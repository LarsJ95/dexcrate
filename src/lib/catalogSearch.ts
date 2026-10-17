import { isNonLatin, translateName } from './names'
import { getSet, getSetList, searchCards, setIdOf, type CardQueryFilters, type Lang, type SetCard, type SetSummary } from './tcgdex'

/** Zoekregel uit het zoekveld: naam, en optioneel een kaartnummer ("Pikachu 25", "pikachu #173"). */
export function parseCatalogQuery(text: string): { name: string; number: string | null } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const last = words.at(-1)?.replace(/^#/, '') ?? ''
  if (words.length > 1 && /^\d+[a-z]?$/i.test(last)) return { name: words.slice(0, -1).join(' '), number: last }
  return { name: words.join(' '), number: null }
}

const sameNumber = (want: string, localId: string): boolean => {
  const a = Number.parseInt(want, 10)
  const b = Number.parseInt(localId, 10)
  return Number.isNaN(a) || Number.isNaN(b) ? want.toLowerCase() === localId.toLowerCase() : a === b
}

export interface CatalogHit {
  card: SetCard
  setId: string
  set: SetSummary | null
  /** Plaats van de set in de TCGdex-setlijst (oud → nieuw, zoals op Sets); -1 = onbekend. */
  order: number
}

export type HitOrder = 'newest' | 'oldest' | 'number' | 'name' | 'rarity' | 'priceDesc' | 'priceAsc'

export const HIT_ORDER_LABELS: Record<HitOrder, string> = {
  newest: 'Newest sets first',
  oldest: 'Oldest sets first',
  number: 'Card number',
  name: 'Name A–Z',
  rarity: 'Rarity (rarest first)',
  priceDesc: 'Price: high to low',
  priceAsc: 'Price: low to high',
}

/** Sorteringen die extra gegevens per kaart nodig hebben. */
export const needsHitPrices = (order: HitOrder): boolean => order === 'priceDesc' || order === 'priceAsc'
export const needsHitRarity = (order: HitOrder): boolean => order === 'rarity'

/** Extra gegevens per kaart-id ("sv03.5-006"); ontbrekend of null = onbekend, altijd achteraan. */
export interface HitSortData {
  price?: ReadonlyMap<string, number | null>
  rank?: ReadonlyMap<string, number>
}

const numberOf = (h: CatalogHit): number => Number.parseInt(h.card.localId, 10) || 0
/** Gedrukt nummer als het met cijfers begint ("006", "25a"); "TG03" of "SV107" = null (achteraan). */
const printedNumber = (h: CatalogHit): number | null => (/^\d/.test(h.card.localId) ? Number.parseInt(h.card.localId, 10) : null)

/** Zoekterm van minstens 2 tekens, of geen zoekterm maar wel een filter of set (bladeren). */
export function catalogActive(query: string, filters: CardQueryFilters, setId = ''): boolean {
  const term = query.trim()
  return term.length >= 2 || (term.length === 0 && Boolean(filters.rarity || filters.type || filters.suffix || setId))
}

/** Nieuwste (of oudste) sets eerst; binnen een set op nummer. Onbekende sets altijd achteraan. */
function bySet(a: CatalogHit, b: CatalogHit, order: 'newest' | 'oldest'): number {
  if (a.order !== b.order) {
    if (a.order < 0 || b.order < 0) return b.order - a.order
    return order === 'newest' ? b.order - a.order : a.order - b.order
  }
  if (a.setId !== b.setId) return a.setId.localeCompare(b.setId)
  return numberOf(a) - numberOf(b)
}

/** Bekende waarden op volgorde, onbekende achteraan; gelijk → nieuwste set eerst. */
function byKnown(a: number | null | undefined, b: number | null | undefined, desc: boolean): number {
  const ka = a !== null && a !== undefined
  const kb = b !== null && b !== undefined
  if (ka !== kb) return ka ? -1 : 1
  if (!ka || !kb || a === b) return 0
  return desc ? b - a : a - b
}

/** Sorteren van zoekresultaten; bij gelijke waarde nieuwste set en dan nummer. */
export function sortHits(hits: readonly CatalogHit[], order: HitOrder = 'newest', data: HitSortData = {}): CatalogHit[] {
  return [...hits].sort((a, b) => {
    let d = 0
    if (order === 'number') d = byKnown(printedNumber(a), printedNumber(b), false) || a.card.localId.localeCompare(b.card.localId, 'en', { numeric: true })
    else if (order === 'name') d = a.card.name.localeCompare(b.card.name, 'en')
    else if (order === 'rarity') d = byKnown(data.rank?.get(a.card.id), data.rank?.get(b.card.id), true)
    else if (order === 'priceDesc' || order === 'priceAsc') d = byKnown(data.price?.get(a.card.id), data.price?.get(b.card.id), order === 'priceDesc')
    return d || bySet(a, b, order === 'oldest' ? 'oldest' : 'newest')
  })
}

/**
 * Kaarten in de TCGdex-catalogus op naam (en nummer) en/of filters (zeldzaamheid, type, kaarttype).
 * Engels direct; voor Aziatische talen wordt een Engelse naam eerst vertaald (Pikachu → ピカチュウ),
 * een eigen schrijfwijze blijft zoals getypt. Zonder naam: bladeren op filter.
 */
export async function searchCatalog(text: string, lang: Lang, filters: CardQueryFilters = {}, setId = ''): Promise<CatalogHit[]> {
  const { name, number } = parseCatalogQuery(text)
  const filtered = Boolean(filters.rarity || filters.type || filters.suffix)
  if (name.length < 2 && !(name.length === 0 && (filtered || setId))) return []
  const term = name === '' || lang === 'en' || isNonLatin(name) ? name : await translateName(name, lang)
  if (term === null || (name !== '' && !term)) return []
  // Alleen een set gekozen: de hele set; anders zoeken en daarna op de set filteren.
  const found =
    setId && name === '' && !filtered
      ? getSet(lang, setId).then((s) => s?.cards ?? [])
      : searchCards(lang, term, filters).then((list) => (setId ? list.filter((c) => setIdOf(c) === setId) : list))
  const [cards, sets] = await Promise.all([
    found,
    getSetList(lang).catch((err: unknown) => {
      console.error('Setlijst ophalen mislukt', err)
      return new Map<string, SetSummary>()
    }),
  ])
  const order = new Map([...sets.keys()].map((id, i) => [id, i]))
  const hits = cards
    .filter((c) => !number || sameNumber(number, c.localId))
    .map((card) => {
      const setId = setIdOf(card)
      return { card, setId, set: sets.get(setId) ?? null, order: order.get(setId) ?? -1 }
    })
  return sortHits(hits)
}
