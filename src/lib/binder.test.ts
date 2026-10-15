import { describe, expect, it } from 'vitest'
import { binderPages, looseCards, nextFreePocket, placeConflicts, placeLabel, type Location, type Placed, type PlannedSlot } from './binder'

const red: Location = { id: 'red', name: 'Red binder', kind: 'binder', page_size: 4, sort_order: 0 }
const box: Location = { id: 'box', name: 'Bulk box', kind: 'box', page_size: null, sort_order: 1 }

const card = (id: string, page: number | null, slot: number | null, patch: Partial<Placed> = {}): Placed => ({
  id,
  name: id,
  quantity: 1,
  tcgdex_id: `en/x-${id}`,
  variant: null,
  location_id: 'red',
  location_page: page,
  location_slot: slot,
  ownership: 'owned',
  ...patch,
})

describe('placeConflicts', () => {
  it('waarschuwt bij twee kaarten in hetzelfde vakje en bij meerdere stuks in één vakje', () => {
    const c = placeConflicts([card('a', 1, 1), card('b', 1, 1), card('c', 1, 2, { quantity: 3 }), card('d', 1, 3)])
    expect(c.get('a')).toBe('Same pocket as b')
    expect(c.get('b')).toBe('Same pocket as a')
    expect(c.get('c')).toBe('3 copies in one pocket')
    expect(c.has('d')).toBe(false)
  })

  it('verkochte kaarten liggen niet meer in de map', () => {
    expect(placeConflicts([card('a', 1, 1), card('b', 1, 1, { ownership: 'sold' })]).size).toBe(0)
  })
})

describe('binderPages', () => {
  const planned: PlannedSlot[] = [
    { id: 'p1', location_id: 'red', page: 1, slot: 2, tcgdex_id: 'en/x-z', label: 'Zapdos', variant: null },
    { id: 'p2', location_id: 'red', page: 2, slot: 1, tcgdex_id: null, label: 'Reserved: Mew', variant: null },
  ]

  it('werkelijke plek en planning naast elkaar, met één lege pagina extra', () => {
    const pages = binderPages(red, [card('a', 1, 1), card('b', 1, 2)], planned)
    expect(pages).toHaveLength(3)
    expect(pages[0][0].actual.map((c) => c.id)).toEqual(['a'])
    // Vakje 2: gepland Zapdos, er ligt kaart b → afwijking.
    expect(pages[0][1]).toMatchObject({ mismatch: true })
    expect(pages[0][1].planned?.label).toBe('Zapdos')
    // Gereserveerd vakje zonder kaart.
    expect(pages[1][0]).toMatchObject({ actual: [], mismatch: false })
    expect(pages[1][0].planned?.label).toBe('Reserved: Mew')
  })

  it('volgende vrije plek slaat bezette en gereserveerde vakjes over', () => {
    expect(nextFreePocket(red, [card('a', 1, 1)], planned)).toEqual({ page: 1, slot: 3 })
  })
})

describe('plaats tonen', () => {
  it('leesbare plek en losse kaarten in een doos', () => {
    const locs = new Map([
      ['red', red],
      ['box', box],
    ])
    expect(placeLabel(card('a', 3, 5), locs)).toBe('Red binder, page 3, pocket 5')
    expect(placeLabel(card('b', null, null, { location_id: 'box' }), locs)).toBe('Bulk box')
    expect(looseCards(box, [card('b', null, null, { location_id: 'box' })]).map((c) => c.id)).toEqual(['b'])
  })
})
