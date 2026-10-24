import { describe, expect, it, vi } from 'vitest'
import type { CardmarketPrice } from './tcgdex'
import { EMPTY_CARD, type Card } from './types'
import type { WishlistItem } from './wishlist'

vi.mock('./supabase', () => ({ supabase: {} }))
const { dealIdsWithinMax, dealsWithinMax, unlinkedCount } = await import('./navCounts')

const card = (over: Partial<Card>): Card => ({ ...EMPTY_CARD, id: 'x', created_at: '', updated_at: '', ...over }) as Card
const wish = (id: string, over: Partial<WishlistItem>): WishlistItem => ({
  id,
  tcgdex_id: `en/x-${id}`,
  name: id,
  set_code: null,
  card_number: null,
  variant: null,
  language: null,
  min_condition: null,
  wanted_qty: 1,
  max_price: null,
  priority: 2,
  notes: null,
  created_at: '',
  ...over,
})
const price = (trend: number): CardmarketPrice => ({
  idProduct: null,
  updated: null,
  trend,
  low: null,
  avg1: null,
  avg7: null,
  avg30: trend,
  trendHolo: null,
  lowHolo: null,
  avg1Holo: null,
  avg7Holo: null,
  avg30Holo: null,
})

describe('menu-getallen', () => {
  it('Collection: niet gekoppelde kaarten in bezit; verkocht en sealed tellen niet', () => {
    const cards = [
      card({ tcgdex_id: null }),
      card({ tcgdex_id: null, status: 'sold' }),
      card({ tcgdex_id: null, kind: 'sealed' }),
      card({ tcgdex_id: 'en/sv01-1' }),
    ]
    expect(unlinkedCount(cards)).toBe(1)
  })

  it('Wishlist: alleen deals binnen je max. prijs', () => {
    const items = [wish('a', { max_price: 5 }), wish('b', { max_price: 1 }), wish('c', {})]
    const prices = new Map([
      ['en/x-a', price(4)],
      ['en/x-b', price(2)],
      ['en/x-c', price(0.1)],
    ])
    expect(dealsWithinMax(items, [], prices)).toBe(1)
    expect(dealIdsWithinMax(items, [], prices)).toEqual(['a'])
  })
})
