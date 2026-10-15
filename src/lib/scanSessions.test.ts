import { describe, expect, it, vi } from 'vitest'
import { earlierInSession, itemsFromRows, toItem, type ScanItem } from './scanSessions'
import { EMPTY_CARD } from './types'

// scanSessions.ts maakt bij import een Supabase-client; die is hier niet nodig.
vi.mock('./supabase', () => ({ supabase: {} }))

const item = (patch: Partial<ScanItem>): ScanItem => ({
  card_id: 'c1',
  name: 'Mew ex',
  set_code: 'MEW',
  card_number: '151',
  tcgdex_id: 'en/sv03.5-151',
  variant: 'holo',
  quantity: 1,
  at: '2026-10-15T20:00:00Z',
  ...patch,
})

describe('scansessie: dubbel toevoegen voorkomen', () => {
  it('herkent dezelfde cataloguskaart (en uitvoering)', () => {
    const items = [item({})]
    expect(earlierInSession(items, { tcgdex_id: 'en/sv03.5-151', variant: 'holo', name: 'Mew ex', set_code: 'MEW', card_number: '151' })).not.toBeNull()
    expect(earlierInSession(items, { tcgdex_id: 'en/sv03.5-151', variant: 'reverse', name: 'Mew ex', set_code: 'MEW', card_number: '151' })).toBeNull()
    expect(earlierInSession(items, { tcgdex_id: 'en/sv03.5-150', name: 'Mewtwo', set_code: 'MEW', card_number: '150' })).toBeNull()
  })

  it('zonder koppeling: zelfde naam, set en nummer', () => {
    const items = [item({ tcgdex_id: null, name: 'Morpeko', set_code: 'CBB3C', card_number: '014' })]
    expect(earlierInSession(items, { tcgdex_id: null, name: 'morpeko', set_code: 'cbb3c', card_number: '14' })?.card_id).toBe('c1')
  })

  it('sessie-items uit nieuwe kaartregels en terug uit de database', () => {
    const [it1] = itemsFromRows([{ ...EMPTY_CARD, id: 'x', user_id: 'u', created_at: '', updated_at: '', photos: [], split_from: null, name: 'Arbok', quantity: 2 }], 't')
    expect(it1).toMatchObject({ card_id: 'x', name: 'Arbok', quantity: 2, at: 't' })
    expect(toItem(it1)).toEqual(it1)
    expect(toItem({ name: 'zonder id' })).toBeNull()
  })
})
