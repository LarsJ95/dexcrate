// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const crate = vi.hoisted(() => ({ status: { points: 94_386, freePack: false } }))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/db', () => ({ listCards: vi.fn(async () => []) }))
vi.mock('../lib/wishlist', () => ({ hasWishlist: vi.fn(async () => false), listWishlist: vi.fn(async () => []) }))
vi.mock('../lib/crate', () => ({
  CRATE_CHANGED_EVENT: 'dexcrate:crate-changed',
  getCrateStatus: vi.fn(async () => ({ ...crate.status })),
}))

const { useNavCounts } = await import('./useNavCounts')

describe('useNavCounts', () => {
  it('Crate points veranderd (bv. via beheer): het menu toont meteen de nieuwe stand', async () => {
    const { result } = renderHook(() => useNavCounts('crate'))
    await waitFor(() => expect(result.current.crate?.points).toBe(94_386))

    crate.status = { points: 294_386, freePack: false }
    act(() => {
      window.dispatchEvent(new Event('dexcrate:crate-changed'))
    })
    await waitFor(() => expect(result.current.crate?.points).toBe(294_386))
  })
})
