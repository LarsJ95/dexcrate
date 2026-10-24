import { describe, expect, it } from 'vitest'
import { WISH_SORTS, WISH_SORT_LABELS, sortWishes } from './wishSort'

const row = (id: string, name: string, set: string | null, num: string | null, max: number | null, at: string) => ({
  item: { id, name, set_code: set, card_number: num, max_price: max, created_at: at },
})
// Volgorde zoals de database ze geeft (prioriteit, dan nieuwste).
const ROWS = [
  row('a', 'Mew ex', 'MEW', '151', 20, '2026-10-03'),
  row('b', 'Charizard ex', 'MEW', '6', null, '2026-10-01'),
  row('c', 'Umbreon VMAX', 'EVS', '215', 900, '2026-10-02'),
  row('d', 'Abra', null, null, 2, '2026-10-04'),
]
const MARKET: Record<string, number | null> = { a: 7, b: 298, c: null, d: 0.5 }
const ids = (sort: (typeof WISH_SORTS)[number]): string[] => sortWishes(ROWS, sort, (i) => MARKET[i.id]).map((r) => r.item.id)

describe('sortWishes', () => {
  it('Priority laat de volgorde van de database staan; elke keuze heeft een label', () => {
    expect(ids('priority')).toEqual(['a', 'b', 'c', 'd'])
    expect(WISH_SORTS.every((s) => WISH_SORT_LABELS[s])).toBe(true)
  })

  it('nieuwste en oudste eerst', () => {
    expect(ids('newest')).toEqual(['d', 'a', 'c', 'b'])
    expect(ids('list')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('set en nummer (numeriek), naam A–Z', () => {
    expect(ids('set')).toEqual(['d', 'c', 'b', 'a'])
    expect(ids('name')).toEqual(['d', 'b', 'a', 'c'])
  })

  it('prijs = marktprijs (zonder marktprijs de max. prijs); hoog-laag en laag-hoog zijn elkaars omgekeerde', () => {
    // Markt: a 7, b 298, c geen (max. 900), d 0,5.
    expect(ids('priceDesc')).toEqual(['c', 'b', 'a', 'd'])
    expect(ids('priceAsc')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('zonder marktprijs én zonder max. prijs altijd achteraan; wensen zonder max. prijs worden toch gesorteerd', () => {
    const rows = [row('x', 'X', null, null, null, '1'), row('y', 'Y', null, null, null, '2'), row('z', 'Z', null, null, null, '3')]
    const market: Record<string, number | null> = { x: 20, y: null, z: 150 }
    expect(sortWishes(rows, 'priceDesc', (i) => market[i.id]).map((r) => r.item.id)).toEqual(['z', 'x', 'y'])
    expect(sortWishes(rows, 'priceAsc', (i) => market[i.id]).map((r) => r.item.id)).toEqual(['x', 'z', 'y'])
  })

  it('verandert de invoer niet', () => {
    sortWishes(ROWS, 'name', () => null)
    expect(ROWS.map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
