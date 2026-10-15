import { describe, expect, it } from 'vitest'
import { marketValue, summarizeMarket } from './prices'
import type { CardmarketPrice } from './tcgdex'
import { EMPTY_CARD, type CardInput } from './types'

const price = (patch: Partial<CardmarketPrice>): CardmarketPrice => ({
  idProduct: null,
  updated: null,
  trend: null,
  low: null,
  avg1: null,
  avg7: null,
  avg30: null,
  trendHolo: null,
  lowHolo: null,
  avg1Holo: null,
  avg7Holo: null,
  avg30Holo: null,
  ...patch,
})

describe('marketValue', () => {
  it('gebruikt de trendprijs, anders 30- of 7-daags gemiddelde', () => {
    expect(marketValue(price({ trend: 1.5, avg30: 2 }), null)).toEqual({ value: 1.5, basis: 'trend', reverse: false })
    expect(marketValue(price({ avg30: 2, avg7: 3 }), 'holo')?.basis).toBe('avg30')
    expect(marketValue(price({ avg7: 3 }), 'normal')?.basis).toBe('avg7')
  })

  it('reverse holo gebruikt de holo-velden en valt niet terug op de normale prijs', () => {
    expect(marketValue(price({ trend: 0.08, trendHolo: 0.28 }), 'reverse')).toEqual({ value: 0.28, basis: 'trend', reverse: true })
    expect(marketValue(price({ trend: 0.74 }), 'reverse')).toBeNull()
  })

  it('geen data → null', () => {
    expect(marketValue(null, null)).toBeNull()
    expect(marketValue(price({}), null)).toBeNull()
  })
})

describe('summarizeMarket', () => {
  const prices = new Map([
    ['en/a-1', price({ trend: 10 })],
    ['en/b-2', price({ trend: 2, trendHolo: 5 })],
    ['en/c-3', null],
  ])
  const card = (patch: Partial<CardInput>): CardInput => ({ ...EMPTY_CARD, name: 'Test', ...patch })

  it('telt alleen kaarten in bezit en splitst met/zonder prijs', () => {
    const s = summarizeMarket(
      [
        card({ tcgdex_id: 'en/a-1', quantity: 2, purchase_price: 6 }),
        card({ tcgdex_id: 'en/b-2', variant: 'reverse', status: 'for_sale', sale_price: 8 }),
        card({ tcgdex_id: 'en/c-3' }),
        card({ tcgdex_id: 'en/a-1', status: 'sold' }), // verkocht: telt niet
        card({ kind: 'sealed', purchase_price: 40 }), // sealed: telt niet mee
      ],
      prices,
    )
    expect(s.owned).toEqual({ value: 25, withPrice: 3, withoutPrice: 1 })
    expect(s.paper).toEqual({ cost: 12, value: 20, gain: 8, count: 2 })
    expect(s.forSale).toEqual({ asking: 8, value: 5, count: 1 })
  })

  it('meldt gegradeerde kaarten apart', () => {
    const s = summarizeMarket([card({ tcgdex_id: 'en/a-1', grading_company: 'PSA', grade: 10 })], prices)
    expect(s.graded).toBe(1)
  })
})
