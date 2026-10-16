import { describe, expect, it, vi } from 'vitest'

// moments.ts haalt via de wishlist Supabase binnen; in CI zijn daar geen sleutels voor.
vi.mock('./supabase', () => ({ supabase: {} }))
const { SET_MILESTONES, newMilestone } = await import('./moments')

describe('mijlpalen', () => {
  it('hoogste nieuwe mijlpaal boven wat al gevierd is', () => {
    expect(newMilestone(9, 0, SET_MILESTONES)).toBeNull()
    expect(newMilestone(10, 0, SET_MILESTONES)).toBe(10)
    expect(newMilestone(30, 10, SET_MILESTONES)).toBe(25)
    expect(newMilestone(30, 25, SET_MILESTONES)).toBeNull()
    expect(newMilestone(120, 25, SET_MILESTONES)).toBe(100)
  })
})
