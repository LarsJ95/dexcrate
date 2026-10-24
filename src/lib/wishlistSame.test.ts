import { describe, expect, it, vi } from 'vitest'
import type { WishlistItem } from './wishlist'

vi.mock('./supabase', () => ({ supabase: {} }))
const { sameWishes } = await import('./wishlist')

const wish = (id: string, over: Partial<WishlistItem>): WishlistItem => ({
  id,
  tcgdex_id: null,
  name: 'Mewtwo ex',
  set_code: '30C',
  card_number: '151',
  variant: null,
  language: null,
  min_condition: null,
  wanted_qty: 1,
  max_price: null,
  priority: 2,
  notes: null,
  created_at: '2026-10-24',
  ...over,
})

describe('sameWishes: staat deze kaart al op je wishlist?', () => {
  const items = [
    wish('a', { tcgdex_id: 'en/30c-151', max_price: 40 }),
    wish('b', { tcgdex_id: null, name: 'Pikachu', set_code: 'SV8', card_number: '057' }),
    wish('c', { tcgdex_id: 'en/sv08-238', name: 'Pikachu ex' }),
  ]

  it('gekoppeld: dezelfde cataloguskaart, ook met andere uitvoering of taal', () => {
    expect(sameWishes(items, { tcgdex_id: 'en/30c-151', name: 'Mewtwo', set_code: null, card_number: null }).map((w) => w.id)).toEqual(['a'])
    expect(sameWishes(items, { tcgdex_id: 'en/30c-150', name: 'Mewtwo ex', set_code: '30C', card_number: '151' }).map((w) => w.id)).toEqual([])
  })

  it('niet gekoppeld: naam, set en nummer (hoofdletters en voorloopnullen tellen niet)', () => {
    expect(sameWishes(items, { tcgdex_id: null, name: ' pikachu ', set_code: 'sv8', card_number: '57' }).map((w) => w.id)).toEqual(['b'])
    expect(sameWishes(items, { tcgdex_id: null, name: 'Pikachu', set_code: 'SV8', card_number: '58' })).toEqual([])
    // Gekoppelde wens tegen ongekoppelde invoer: op naam, set en nummer.
    expect(sameWishes(items, { tcgdex_id: null, name: 'Mewtwo ex', set_code: '30C', card_number: '151' }).map((w) => w.id)).toEqual(['a'])
  })

  it('lege invoer: niets', () => {
    expect(sameWishes(items, { tcgdex_id: null, name: '  ', set_code: null, card_number: null })).toEqual([])
  })
})
