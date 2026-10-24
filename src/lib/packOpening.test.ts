import { describe, expect, it, vi } from 'vitest'
import type { PackPull } from './crate'

// crate.ts laadt de Supabase-client; in CI zijn daar geen sleutels voor.
vi.mock('./supabase', () => ({ supabase: {} }))
const { bestPull, countsAfter, duplicatePoints, hitTier, packTier, printedNumber, revealOrder, setGains } = await import('./packOpening')

const pull = (id: string, rarity: string): PackPull => ({ tcgdex_id: id, name: id, image: null, rarity, set_name: 'Set' })

describe('pack opening', () => {
  const pulls = [pull('en/a-1', 'Double rare'), pull('en/a-2', 'Common'), pull('en/a-3', 'Uncommon'), pull('en/a-2', 'Common')]

  it('zeldzaamste als laatste; NEW alleen voor het eerste exemplaar', () => {
    const order = revealOrder(pulls, new Map([['en/a-3', 1]]))
    expect(order.map((c) => c.tcgdex_id)).toEqual(['en/a-2', 'en/a-2', 'en/a-3', 'en/a-1'])
    expect(order.map((c) => c.isNew)).toEqual([true, false, false, true])
    expect(order.map((c) => c.copies)).toEqual([1, 2, 2, 1])
  })

  it('aantallen na het openen en punten voor de dubbelen (factor uit de regels)', () => {
    const order = revealOrder(pulls, new Map([['en/a-3', 1]]))
    const counts = countsAfter(order)
    expect([...counts]).toEqual([
      ['en/a-2', 2],
      ['en/a-3', 2],
      ['en/a-1', 1],
    ])
    // Common 2×2 + Uncommon 3×2 = 10; na inruilen van a-2 blijft 6 over.
    expect(duplicatePoints(order, counts, 2)).toBe(10)
    expect(duplicatePoints(order, new Map(counts).set('en/a-2', 1), 2)).toBe(6)
  })
})

describe('spelelementen (24-10-2026)', () => {
  it('hit-niveau per zeldzaamheid en voor het hele pakje', () => {
    expect(['Common', 'Rare Holo', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Hyper rare', null].map(hitTier)).toEqual([0, 0, 1, 1, 2, 3, 3, 0])
    expect(packTier([pull('en/a-1', 'Common'), pull('en/a-2', 'Illustration rare'), pull('en/a-3', 'Double rare')])).toBe(2)
    expect(packTier([])).toBe(0)
  })

  it('best pull: meeste waarde; zonder prijzen de zeldzaamste; bij gelijk de laatste', () => {
    const cards = [pull('en/a-1', 'Common'), pull('en/a-2', 'Double rare'), pull('en/a-3', 'Uncommon')]
    expect(bestPull(cards, (id) => ({ 'en/a-1': 0.1, 'en/a-2': 2, 'en/a-3': 9 })[id] ?? null)).toBe(2)
    expect(bestPull(cards, () => null)).toBe(1)
    expect(bestPull([pull('en/a-1', 'Common'), pull('en/a-2', 'Common')], () => 1)).toBe(1)
    expect(bestPull([], () => null)).toBeNull()
  })

  it('setvoortgang: alleen sets met een nieuwe officiële kaart, grootste stap eerst', () => {
    const official = new Map([
      ['en/a', 10],
      ['en/b', 5],
    ])
    const before = new Map([
      ['en/a-1', 1],
      ['en/a-2', 1],
      ['en/b-1', 1],
    ])
    const cards = revealOrder(
      [
        { ...pull('en/a-3', 'Common'), set_name: 'Alpha' },
        { ...pull('en/a-4', 'Common'), set_name: 'Alpha' },
        { ...pull('en/a-11', 'Hyper rare'), set_name: 'Alpha' }, // geheim nummer: telt niet
        { ...pull('en/b-1', 'Common'), set_name: 'Beta' }, // al gehad
        { ...pull('en/b-2', 'Common'), set_name: 'Beta' },
        { ...pull('en/c-1', 'Common'), set_name: 'Gamma' }, // onbekend aantal: overslaan
      ],
      before,
    )
    expect(setGains(cards, before, official)).toEqual([
      { setKey: 'en/a', name: 'Alpha', before: 2, after: 4, official: 10 },
      { setKey: 'en/b', name: 'Beta', before: 1, after: 2, official: 5 },
    ])
    expect(setGains(revealOrder([pull('en/a-1', 'Common')], before), before, official)).toEqual([])
  })

  it('nummer zoals op de kaart', () => {
    const official = new Map([['en/sv08', 191]])
    expect(printedNumber('en/sv08-057', official)).toBe('057/191')
    expect(printedNumber('en/swsh7-94', official)).toBe('#94')
    expect(printedNumber('en/sv08-', official)).toBeNull()
    expect(printedNumber('zonder', official)).toBeNull()
  })
})
