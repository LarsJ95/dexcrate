import { describe, expect, it, vi } from 'vitest'
import type { CardmarketPrice } from './tcgdex'
import type { WishlistItem } from './wishlist'
import { EMPTY_CARD } from './types'

vi.mock('./supabase', () => ({ supabase: {} }))
const { wishDeals } = await import('./wishDeals')

const wish = (id: string, over: Partial<WishlistItem> = {}): WishlistItem => ({
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
  created_at: '2026-10-18T10:00:00Z',
  ...over,
})
const price = (trend: number, avg30: number): CardmarketPrice => ({
  idProduct: null,
  updated: null,
  trend,
  low: null,
  avg1: null,
  avg7: null,
  avg30,
  trendHolo: null,
  lowHolo: null,
  avg1Holo: null,
  avg7Holo: null,
  avg30Holo: null,
})

describe('wishlist deals', () => {
  it('binnen je max eerst (grootste korting), dan de grootste dalers; gevonden, ongekoppeld en zonder prijs eruit', () => {
    const items = [
      wish('a', { max_price: 10 }), // 9 van max 10: 10% korting
      wish('b', { max_price: 10 }), // 5 van max 10: 50% korting
      wish('c'), // daalt 20%
      wish('d'), // stijgt 10%
      wish('e', { max_price: 2 }), // boven je max, daalt 5%
      wish('f', { tcgdex_id: null }),
      wish('g'), // al in bezit
      wish('h'), // geen prijs
    ]
    const prices = new Map<string, CardmarketPrice | null>([
      ['en/x-a', price(9, 9)],
      ['en/x-b', price(5, 5)],
      ['en/x-c', price(4, 5)],
      ['en/x-d', price(1.1, 1)],
      ['en/x-e', price(3.8, 4)],
      ['en/x-g', price(1, 1)],
      ['en/x-h', null],
    ])
    const cards = [{ ...EMPTY_CARD, tcgdex_id: 'en/x-g' }]
    const deals = wishDeals(items, cards, prices)
    expect(deals.map((d) => d.item.id)).toEqual(['b', 'a', 'c', 'e', 'd'])
    expect(deals.map((d) => d.withinMax)).toEqual([true, true, false, false, false])
    expect(wishDeals(items, cards, prices, 2)).toHaveLength(2)
  })
})
