import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { listChanges, toMembers } = await import('./wishlistLists')

describe('eigen wishlist-lijsten', () => {
  it('koppelingen uit de database: per lijst de wensen; rommel overslaan', () => {
    const m = toMembers([
      { list_id: 'l1', item_id: 'a' },
      { list_id: 'l1', item_id: 'b' },
      { list_id: 'l2', item_id: 'a' },
      { list_id: 'l2' },
      null,
      'x',
    ])
    expect([...(m.get('l1') ?? [])]).toEqual(['a', 'b'])
    expect([...(m.get('l2') ?? [])]).toEqual(['a'])
  })

  it('wens in precies de gekozen eigen lijsten: alleen wat verandert', () => {
    const members = toMembers([
      { list_id: 'l1', item_id: 'a' },
      { list_id: 'l2', item_id: 'a' },
    ])
    expect(listChanges(members, 'a', new Set(['l2', 'l3']), ['l1', 'l2', 'l3'])).toEqual({ add: ['l3'], remove: ['l1'] })
    expect(listChanges(members, 'a', new Set(['l1', 'l2']), ['l1', 'l2', 'l3'])).toEqual({ add: [], remove: [] })
    // Nieuwe wens: alleen toevoegen.
    expect(listChanges(members, 'nieuw', new Set(['l1']), ['l1', 'l2'])).toEqual({ add: ['l1'], remove: [] })
  })
})
