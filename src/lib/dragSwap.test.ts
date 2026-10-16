import { describe, expect, it } from 'vitest'
import { compareOrder, swapOrder, type Ordered } from './dragSwap'

const card = (id: string, sort_order: number, created_at = '2026-10-01T00:00:00Z'): Ordered => ({ id, sort_order, created_at })

function apply(all: Ordered[], changes: Map<string, number>): string[] {
  return all
    .map((c) => ({ ...c, sort_order: changes.get(c.id) ?? c.sort_order }))
    .sort(compareOrder)
    .map((c) => c.id)
}

describe('swapOrder', () => {
  it('wisselt alleen de twee kaarten bij verschillende waarden', () => {
    const all = [card('a', 2), card('b', 5), card('c', 9)]
    const changes = swapOrder(all, 'a', 'c')
    expect([...changes]).toEqual([
      ['c', 2],
      ['a', 9],
    ])
    expect(apply(all, changes)).toEqual(['c', 'b', 'a'])
  })

  it('werkt ook als waarden gelijk zijn (op toevoegdatum)', () => {
    const all = [card('a', 0, '2026-10-01'), card('b', 0, '2026-10-02'), card('c', 0, '2026-10-03')]
    const changes = swapOrder(all, 'c', 'a')
    expect(apply(all, changes)).toEqual(['c', 'b', 'a'])
  })

  it('laat verborgen kaarten ertussen op hun plek', () => {
    const all = [card('a', 1), card('hidden', 2), card('b', 3), card('d', 4)]
    expect(apply(all, swapOrder(all, 'b', 'a'))).toEqual(['b', 'hidden', 'a', 'd'])
  })

  it('doet niets bij dezelfde of een onbekende kaart', () => {
    const all = [card('a', 1), card('b', 2)]
    expect(swapOrder(all, 'a', 'a').size).toBe(0)
    expect(swapOrder(all, 'a', 'x').size).toBe(0)
  })
})
