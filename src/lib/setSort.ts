/** Sorteren van de kaarten op een setpagina. 'number' = binder-volgorde (zoals de set is genummerd). */
export type SetSort = 'number' | 'value' | 'valueAsc' | 'rarity' | 'name' | 'owned' | 'missing'

export const SET_SORT_LABELS: Record<SetSort, string> = {
  number: 'Number',
  value: 'Value: high to low',
  valueAsc: 'Value: low to high',
  rarity: 'Rarity: rarest first',
  name: 'Name A–Z',
  owned: 'Owned first',
  missing: 'Missing first',
}

/** Sortering op marktwaarde (hoog → laag of laag → hoog): daarvoor moeten de prijzen geladen worden. */
export const isValueSort = (sort: SetSort): boolean => sort === 'value' || sort === 'valueAsc'

export interface SortData {
  /** Kaart compleet (alle gevraagde exemplaren in bezit)? */
  complete: (id: string) => boolean
  /** Marktwaarde per kaart-id; ontbreekt of null = onbekend (achteraan). */
  value: ReadonlyMap<string, number | null>
  /** Zeldzaamheidsrang per kaart-id (hoger = zeldzamer); ontbreekt = onbekend (achteraan). */
  rank: ReadonlyMap<string, number>
}

/** Gesorteerde kopie; bij gelijke stand blijft de setvolgorde. */
export function sortSetCards<T extends { id: string; name: string }>(cards: readonly T[], sort: SetSort, data: SortData): T[] {
  if (sort === 'number') return [...cards]
  const order = new Map(cards.map((c, i) => [c.id, i]))
  const byOrder = (a: T, b: T): number => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  // Onbekend (undefined/null) altijd achteraan, ook bij aflopend sorteren.
  const desc = (x: number | null | undefined, y: number | null | undefined): number => (y ?? -Infinity) - (x ?? -Infinity)
  const asc = (x: number | null | undefined, y: number | null | undefined): number => (x ?? Infinity) - (y ?? Infinity)
  const compare: Record<Exclude<SetSort, 'number'>, (a: T, b: T) => number> = {
    value: (a, b) => desc(data.value.get(a.id), data.value.get(b.id)),
    valueAsc: (a, b) => asc(data.value.get(a.id), data.value.get(b.id)),
    rarity: (a, b) => desc(data.rank.get(a.id), data.rank.get(b.id)),
    name: (a, b) => a.name.localeCompare(b.name, 'en'),
    owned: (a, b) => Number(data.complete(b.id)) - Number(data.complete(a.id)),
    missing: (a, b) => Number(data.complete(a.id)) - Number(data.complete(b.id)),
  }
  return [...cards].sort((a, b) => compare[sort](a, b) || byOrder(a, b))
}
