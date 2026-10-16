import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { RARE_SLOT, packSlots } = await import('./crate')

describe('Crate-pakje', () => {
  it('kansen in het rare-vak tellen op tot 1', () => {
    expect(RARE_SLOT.reduce((n, s) => n + s.weight, 0)).toBeCloseTo(1)
  })
  it('6 common, 3 uncommon en een rare-vak volgens de kans', () => {
    const slots = packSlots(() => 0.01)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(6)
    expect(slots.filter((s) => s === 'Uncommon')).toHaveLength(3)
    expect(slots[9]).toBe('Rare')
    expect(packSlots(() => 0.999)[9]).toBe('Hyper rare')
    expect(packSlots(() => 0.6)[9]).toBe('Rare Holo')
  })
})
