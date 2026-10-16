import { isNonLatin, translateName } from './names'
import { getSetList, searchCards, setIdOf, type CardQueryFilters, type Lang, type SetCard, type SetSummary } from './tcgdex'

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

export type HitOrder = 'newest' | 'oldest'

/** Zoekterm van minstens 2 tekens, of geen zoekterm maar wel een filter (bladeren). */
export function catalogActive(query: string, filters: CardQueryFilters): boolean {
  const term = query.trim()
  return term.length >= 2 || (term.length === 0 && Boolean(filters.rarity || filters.type || filters.suffix))
}

/** Nieuwste (of oudste) sets eerst; binnen een set op nummer. Onbekende sets altijd achteraan. */
export function sortHits(hits: readonly CatalogHit[], order: HitOrder = 'newest'): CatalogHit[] {
  return [...hits].sort((a, b) => {
    if (a.order !== b.order) {
      if (a.order < 0 || b.order < 0) return b.order - a.order
      return order === 'newest' ? b.order - a.order : a.order - b.order
    }
    if (a.setId !== b.setId) return a.setId.localeCompare(b.setId)
    return (Number.parseInt(a.card.localId, 10) || 0) - (Number.parseInt(b.card.localId, 10) || 0)
  })
}

/**
 * Kaarten in de TCGdex-catalogus op naam (en nummer) en/of filters (zeldzaamheid, type, kaarttype).
 * Engels direct; voor Aziatische talen wordt een Engelse naam eerst vertaald (Pikachu → ピカチュウ),
 * een eigen schrijfwijze blijft zoals getypt. Zonder naam: bladeren op filter.
 */
export async function searchCatalog(text: string, lang: Lang, filters: CardQueryFilters = {}): Promise<CatalogHit[]> {
  const { name, number } = parseCatalogQuery(text)
  const filtered = Boolean(filters.rarity || filters.type || filters.suffix)
  if (name.length < 2 && !(name.length === 0 && filtered)) return []
  const term = name === '' || lang === 'en' || isNonLatin(name) ? name : await translateName(name, lang)
  if (term === null || (name !== '' && !term)) return []
  const [cards, sets] = await Promise.all([
    searchCards(lang, term, filters),
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
