import { describe, expect, it } from 'vitest'
import { computeStats, formatEur } from './stats'
import { EMPTY_CARD, type CardInput } from './types'

const card = (patch: Partial<CardInput>): CardInput => ({ ...EMPTY_CARD, name: 'Test', ...patch })

describe('computeStats', () => {
  it('telt per stuk en rekent regeltotaal als aantal × stukprijs', () => {
    const s = computeStats([
      card({ status: 'sold', quantity: 3, sale_price: 9.95 }),
      card({ status: 'sold', quantity: 1, sale_price: 0.05 }),
      card({ status: 'for_sale', quantity: 2, sale_price: 1.1 }),
    ])
    expect(s.sold).toEqual({ amount: 29.9, count: 4 })
    expect(s.forSale).toEqual({ amount: 2.2, count: 2 })
  })

  it('voorkomt float-afrondingsfouten (0,1 + 0,2)', () => {
    const s = computeStats([card({ status: 'sold', sale_price: 0.1 }), card({ status: 'sold', sale_price: 0.2 })])
    expect(s.sold.amount).toBe(0.3)
  })

  it('gekocht = alles met aankoopprijs, ongeacht status; netto = verkocht − gekocht', () => {
    const s = computeStats([
      card({ status: 'collection', purchase_price: 10 }),
      card({ status: 'sold', purchase_price: 4, sale_price: 7 }),
      card({ status: 'collection', purchase_price: null }), // uit eigen pack
    ])
    expect(s.bought).toEqual({ amount: 14, count: 2 })
    expect(s.net).toBe(-7)
    expect(s.collection.count).toBe(2)
  })

  it('verkoopratio en gemiddelden zoals het Excel-dashboard', () => {
    const s = computeStats([
      card({ status: 'sold', quantity: 9, sale_price: 2 }),
      card({ status: 'for_sale', quantity: 1, sale_price: 5 }),
      card({ status: 'collection', quantity: 4, purchase_price: 2.5 }),
    ])
    expect(s.sellRatio).toBeCloseTo(0.9)
    expect(s.avgSold).toBe(2)
    expect(s.avgForSale).toBe(5)
    expect(s.avgBought).toBe(2.5)
  })

  it('lege collectie geeft nullen in plaats van NaN', () => {
    const s = computeStats([])
    expect(s.sellRatio).toBe(0)
    expect(s.avgSold).toBe(0)
    expect(s.avgBought).toBe(0)
    expect(s.net).toBe(0)
  })
})

describe('formatEur', () => {
  it('formatteert in Nederlandse notatie', () => {
    // Intl gebruikt een vaste spatie na het euroteken; normaliseren voor de vergelijking.
    expect(formatEur(1234.5).replace(/\s/g, ' ')).toBe('€ 1.234,50')
  })
})
