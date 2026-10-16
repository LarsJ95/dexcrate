import { describe, expect, it } from 'vitest'
import { achievements, levelFor, xpFor, xpForLevel, type ProgressCard } from './progress'

let n = 0
const card = (patch: Partial<ProgressCard>): ProgressCard => ({
  id: `c${++n}`,
  name: 'Card',
  quantity: 1,
  dexId: null,
  types: null,
  rarity: null,
  language: 'en',
  value: null,
  createdAt: null,
  ...patch,
})

describe('XP en level', () => {
  it('XP uit kaarten, zeldzaamheid, soorten en badges', () => {
    expect(xpFor([card({ dexId: 25 })], 0)).toBe(10 + 15)
    expect(xpFor([card({ dexId: 25, quantity: 2, rarity: 'Hyper rare' })], 1)).toBe(2 * (10 + 20) + 15 + 50)
  })
  it('level groeit geleidelijk, level 100 is het maximum', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: xpForLevel(2) })
    expect(levelFor(xpForLevel(12)).level).toBe(12)
    expect(levelFor(xpForLevel(12) - 1).level).toBe(11)
    expect(levelFor(10 ** 9)).toEqual({ level: 100, into: 0, needed: 0 })
  })

  it('kleine collectie blijft laag: 42 kaarten, 36 soorten, 3 badges → rond level 6', () => {
    const cards = Array.from({ length: 42 }, (_, i) => card({ dexId: i < 36 ? i + 1 : 1, rarity: i % 3 === 0 ? 'Double rare' : 'Common' }))
    const { level } = levelFor(xpFor(cards, 3))
    expect(level).toBeGreaterThanOrEqual(5)
    expect(level).toBeLessThanOrEqual(7)
  })
})

describe('verborgen prestaties', () => {
  it('Kanto-starters, Pikachu-fanclub, talen', () => {
    const earned = (cards: ProgressCard[]): string[] => achievements(cards).filter((a) => a.earned).map((a) => a.id)
    expect(earned([card({ dexId: 2 }), card({ dexId: 6 }), card({ dexId: 7 })])).toContain('kanto-starters')
    expect(earned([card({ dexId: 2 }), card({ dexId: 6 })])).not.toContain('kanto-starters')
    expect(earned([card({ dexId: 25, quantity: 5 })])).toContain('pika-fan')
    expect(earned([card({ language: 'en' }), card({ language: 'ja' }), card({ language: 'nl' })])).toContain('world')
    expect(earned([card({ rarity: 'Special illustration rare' })])).toContain('sir')
  })
})

