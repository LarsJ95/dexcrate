import { describe, expect, it } from 'vitest'
import { achievements, dailyDexId, levelFor, weekReport, xpFor, xpForLevel, type ProgressCard } from './progress'

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
    expect(xpFor([card({ dexId: 25 })], 0)).toBe(10 + 25)
    expect(xpFor([card({ dexId: 25, quantity: 2, rarity: 'Hyper rare' })], 1)).toBe(2 * (10 + 40) + 25 + 100)
  })
  it('level groeit geleidelijk, level 100 is het maximum', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: xpForLevel(2) })
    expect(levelFor(xpForLevel(12)).level).toBe(12)
    expect(levelFor(xpForLevel(12) - 1).level).toBe(11)
    expect(levelFor(10 ** 9)).toEqual({ level: 100, into: 0, needed: 0 })
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

describe('Pokémon van de dag en weekrapport', () => {
  it('vast per dag, binnen 1-1025', () => {
    const a = dailyDexId(new Date(2026, 9, 16, 8))
    expect(dailyDexId(new Date(2026, 9, 16, 23))).toBe(a)
    expect(dailyDexId(new Date(2026, 9, 17))).not.toBe(a)
    expect(a).toBeGreaterThanOrEqual(1)
    expect(a).toBeLessThanOrEqual(1025)
  })
  it('alleen de laatste 7 dagen; nieuwe soorten en beste kaart', () => {
    const now = new Date('2026-10-16T12:00:00Z')
    const r = weekReport(
      [
        card({ dexId: 25, createdAt: '2026-09-01T00:00:00Z', value: 50 }),
        card({ dexId: 25, createdAt: '2026-10-15T00:00:00Z', value: 3 }),
        card({ dexId: 6, createdAt: '2026-10-14T00:00:00Z', value: 20, name: 'Charizard ex' }),
      ],
      now,
    )
    expect(r).toMatchObject({ added: 2, newSpecies: 1, addedValue: 23 })
    expect(r.best?.name).toBe('Charizard ex')
  })
})
