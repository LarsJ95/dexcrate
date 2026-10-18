// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// moments.ts haalt via de wishlist Supabase binnen; in CI zijn daar geen sleutels voor.
vi.mock('./supabase', () => ({ supabase: {} }))
const { BADGES_KEY, SET_MILESTONES, celebrateBadges, celebrateMilestone, endMoment, newMilestone, quietNext, takeQuiet, useMoment } = await import('./moments')

describe('mijlpalen', () => {
  it('hoogste nieuwe mijlpaal boven wat al gevierd is', () => {
    expect(newMilestone(9, 0, SET_MILESTONES)).toBeNull()
    expect(newMilestone(10, 0, SET_MILESTONES)).toBe(10)
    expect(newMilestone(30, 10, SET_MILESTONES)).toBe(25)
    expect(newMilestone(30, 25, SET_MILESTONES)).toBeNull()
    expect(newMilestone(120, 25, SET_MILESTONES)).toBe(100)
  })
})

describe('stil bijwerken na scannen', () => {
  beforeEach(() => localStorage.clear())

  /** Huidig moment (en meteen afsluiten, zodat de volgende test leeg begint). */
  function shown(run: () => void): string | null {
    const { result } = renderHook(() => useMoment())
    act(run)
    const m = result.current
    if (m) act(() => endMoment(m.id))
    return m?.kind ?? null
  }

  it('geldt één keer per sleutel', () => {
    quietNext(['a', 'b'])
    expect(takeQuiet('a')).toBe(true)
    expect(takeQuiet('a')).toBe(false)
    expect(takeQuiet('b')).toBe(true)
    expect(localStorage.getItem('dexcrate:quiet-progress')).toBeNull()
  })

  it('mijlpaal wordt stil onthouden, daarna weer gevierd', () => {
    localStorage.setItem('m', '10')
    quietNext(['m'])
    expect(shown(() => celebrateMilestone('m', 30, SET_MILESTONES, (n) => `${n} cards`))).toBeNull()
    expect(localStorage.getItem('m')).toBe('25')
    expect(shown(() => celebrateMilestone('m', 60, SET_MILESTONES, (n) => `${n} cards`))).toBe('milestone')
  })

  it('nieuwe badge na scannen geeft geen moment, zonder markering wel', () => {
    localStorage.setItem(BADGES_KEY, 'boulder')
    quietNext([BADGES_KEY])
    const badge = (id: string): { id: string; name: string; color: string } => ({ id, name: id, color: 'red' })
    expect(shown(() => celebrateBadges([badge('boulder'), badge('cascade')]))).toBeNull()
    expect(localStorage.getItem(BADGES_KEY)).toBe('boulder,cascade')
    expect(shown(() => celebrateBadges([badge('boulder'), badge('cascade'), badge('thunder')]))).toBe('badge')
  })
})
