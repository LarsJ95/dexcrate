import { describe, expect, it, vi } from 'vitest'
import type { PackPull } from './crate'

// crate.ts laadt de Supabase-client; in CI zijn daar geen sleutels voor.
vi.mock('./supabase', () => ({ supabase: {} }))
const { countsAfter, duplicatePoints, revealOrder } = await import('./packOpening')

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
