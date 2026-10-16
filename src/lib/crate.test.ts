import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { GREAT_SLOT, HIT_SLOT, PACKS, RARE_SLOT, canAfford, packSlots, tradeValue } = await import('./crate')

describe('Crate-pakje', () => {
  it('kansen per vak tellen op tot 1', () => {
    for (const odds of [RARE_SLOT, GREAT_SLOT, HIT_SLOT]) expect(odds.reduce((n, s) => n + s.weight, 0)).toBeCloseTo(1)
  })
  it('booster: 6 common, 3 uncommon en een rare-vak volgens de kans', () => {
    const slots = packSlots('booster', () => 0.01)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(6)
    expect(slots.filter((s) => s === 'Uncommon')).toHaveLength(3)
    expect(slots[9]).toBe('Rare')
    expect(packSlots('booster', () => 0.999)[9]).toBe('Hyper rare')
    expect(packSlots('booster', () => 0.6)[9]).toBe('Rare Holo')
  })
  it('great: 5 common, 3 uncommon, 2 rare-vakken', () => {
    const slots = packSlots('great', () => 0.999)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(5)
    expect(slots.slice(8)).toEqual(['Hyper rare', 'Hyper rare'])
  })
  it('master: geen commons, 2 hits van minstens Double rare', () => {
    const slots = packSlots('master', () => 0.01)
    expect(slots).toHaveLength(10)
    expect(slots).not.toContain('Common')
    expect(slots.slice(8)).toEqual(['Double rare', 'Double rare'])
  })
  it('kosten en gratis booster', () => {
    expect(PACKS.master.cost).toBe(1000)
    expect(canAfford('booster', 0, true)).toBe(true)
    expect(canAfford('great', 0, true)).toBe(false)
    expect(canAfford('great', 300, false)).toBe(true)
  })
  it('inruilwaarde volgens zeldzaamheid', () => {
    expect(tradeValue('Hyper rare')).toBe(30)
    expect(tradeValue('Rare Holo')).toBe(5)
    expect(tradeValue('Uncommon')).toBe(3)
    expect(tradeValue(null)).toBe(2)
  })
})
