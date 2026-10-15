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
    expect(s.sold).toEqual({ amount: 29.9, count: 4, unknown: 0 })
    expect(s.forSale).toEqual({ amount: 2.2, count: 2, unknown: 0 })
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
    expect(s.bought).toEqual({ amount: 14, count: 2, unknown: 0 })
    expect(s.net).toBe(-7)
    expect(s.collection.count).toBe(2)
  })

  it('onbekende prijzen en kosten tellen niet als 0', () => {
    const s = computeStats([
      card({ status: 'sold', quantity: 2, sale_price: 5 }),
      card({ status: 'sold', quantity: 1, sale_price: null }),
      card({ status: 'collection', quantity: 3, purchase_price: null }),
    ])
    expect(s.sold).toEqual({ amount: 10, count: 3, unknown: 1 })
    // Gemiddelde alleen over de 2 stuks met bekende prijs, niet 10 / 3.
    expect(s.avgSold).toBe(5)
    // Niemand heeft een aankoopprijs: netto is niet definitief.
    expect(s.costUnknown).toBe(6)
    expect(s.netComplete).toBe(false)
  })

  it('netto is definitief als alle bedragen bekend zijn', () => {
    const s = computeStats([card({ status: 'sold', purchase_price: 4, sale_price: 7 })])
    expect(s.net).toBe(3)
    expect(s.netComplete).toBe(true)
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
  it('formatteert in Engelse notatie met euro', () => {
    expect(formatEur(1234.5)).toBe('€1,234.50')
  })
})
