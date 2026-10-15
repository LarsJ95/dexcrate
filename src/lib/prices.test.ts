import { describe, expect, it } from 'vitest'
import { marketValue, portfolioSeries, summarizeMarket, topMovers } from './prices'
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
    expect(marketValue(price({ trend: 1.5, avg30: 2 }), null)).toEqual({ value: 1.5, basis: 'trend', reverse: false, change30: -0.25 })
    expect(marketValue(price({ avg30: 2, avg7: 3 }), 'holo')?.basis).toBe('avg30')
    expect(marketValue(price({ avg7: 3 }), 'normal')?.basis).toBe('avg7')
  })

  it('reverse holo gebruikt de holo-velden en valt niet terug op de normale prijs', () => {
    expect(marketValue(price({ trend: 0.08, trendHolo: 0.28 }), 'reverse')).toEqual({
      value: 0.28,
      basis: 'trend',
      reverse: true,
      change30: null,
    })
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

  it('gewogen 30-dagenbeweging van het bezit', () => {
    const p = new Map([
      ['en/x-1', price({ trend: 11, avg30: 10 })], // +10%
      ['en/y-2', price({ trend: 9, avg30: 10 })], // −10%
    ])
    const s = summarizeMarket(
      [card({ tcgdex_id: 'en/x-1', quantity: 3 }), card({ tcgdex_id: 'en/y-2', quantity: 1 })],
      p,
    )
    // (33 + 9) / (30 + 10) − 1 = +5%
    expect(s.change30).toBeCloseTo(0.05)
  })

  it('meldt gegradeerde kaarten apart', () => {
    const s = summarizeMarket([card({ tcgdex_id: 'en/a-1', grading_company: 'PSA', grade: 10 })], prices)
    expect(s.graded).toBe(1)
  })
})

describe('topMovers', () => {
  const card = (patch: Partial<CardInput>): CardInput => ({ ...EMPTY_CARD, name: 'Test', ...patch })
  const p = new Map([
    ['en/a-1', price({ trend: 12, avg30: 10 })], // +20%
    ['en/b-2', price({ trend: 8, avg30: 10 })], // −20%
    ['en/c-3', price({ trend: 0.2, avg30: 0.1 })], // +100%, maar te goedkoop
    ['en/d-4', price({ trend: 50, avg30: 50 })], // vlak, wel waardevol
  ])

  it('sorteert stijgers en dalers, negeert centenkaarten en verkochte kaarten', () => {
    const r = topMovers(
      [
        card({ tcgdex_id: 'en/a-1' }),
        card({ tcgdex_id: 'en/b-2' }),
        card({ tcgdex_id: 'en/c-3' }),
        card({ tcgdex_id: 'en/d-4' }),
        card({ tcgdex_id: 'en/a-1', status: 'sold' }),
      ],
      p,
    )
    expect(r.up.map((m) => m.card.tcgdex_id)).toEqual(['en/a-1'])
    expect(r.down.map((m) => m.card.tcgdex_id)).toEqual(['en/b-2'])
    expect(r.valuable[0].card.tcgdex_id).toBe('en/d-4')
  })

  it('telt dezelfde kaart + variant maar één keer', () => {
    const r = topMovers([card({ tcgdex_id: 'en/a-1' }), card({ tcgdex_id: 'en/a-1' })], p)
    expect(r.valuable).toHaveLength(1)
  })
})

describe('portfolioSeries', () => {
  const card = (patch: Partial<CardInput>): CardInput => ({ ...EMPTY_CARD, name: 'Test', ...patch })

  it('telt per dag de waarde van het huidige bezit, met laatst bekende prijs bij gaten', () => {
    const series = portfolioSeries(
      [card({ tcgdex_id: 'en/a-1', quantity: 2 }), card({ tcgdex_id: 'en/b-2', variant: 'reverse' })],
      [
        { tcgdexId: 'en/a-1', takenOn: '2026-10-01', trend: 1, trendHolo: null },
        { tcgdexId: 'en/b-2', takenOn: '2026-10-01', trend: 5, trendHolo: 3 },
        { tcgdexId: 'en/a-1', takenOn: '2026-10-02', trend: 1.5, trendHolo: null },
        // b-2 ontbreekt op 10-02 → laatst bekende reverse-prijs (3) telt
        { tcgdexId: 'en/z-9', takenOn: '2026-10-02', trend: 99, trendHolo: null }, // niet in bezit
      ],
    )
    expect(series).toEqual([
      { date: '2026-10-01', value: 5 },
      { date: '2026-10-02', value: 6 },
    ])
  })
})
