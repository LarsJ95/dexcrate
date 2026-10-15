import { describe, expect, it, vi } from 'vitest'
import { EMPTY_SETTINGS, conditionEstimate, growthSplit, netEstimate, parseTcgplayer, tcgplayerFor } from './valuation'

// valuationDb.ts maakt bij import een Supabase-client; die is hier niet nodig.
vi.mock('./supabase', () => ({ supabase: {} }))

describe('TCGplayer-prijzen', () => {
  const tp = parseTcgplayer({
    pricing: {
      tcgplayer: {
        unit: 'USD',
        updated: '2026-10-15',
        normal: { marketPrice: 0.19 },
        'reverse-holofoil': { marketPrice: 0.33 },
      },
    },
  })

  it('per uitvoering, in USD, zonder omrekening', () => {
    expect(tcgplayerFor(tp, 'reverse')).toEqual({ key: 'reverse-holofoil', market: 0.33 })
    expect(tcgplayerFor(tp, 'normal')).toEqual({ key: 'normal', market: 0.19 })
  })

  it('onbekende of niet-bestaande uitvoering: geen gok', () => {
    expect(tcgplayerFor(tp, null)).toBeNull()
    expect(tcgplayerFor(tp, 'holo')).toBeNull()
  })

  it('alleen USD wordt gelezen', () => {
    expect(parseTcgplayer({ pricing: { tcgplayer: { unit: 'EUR', normal: { marketPrice: 1 } } } })).toBeNull()
  })
})

describe('schattingen op basis van eigen instellingen', () => {
  const settings = { ...EMPTY_SETTINGS, conditionPct: { LP: 60 }, saleFeePct: 5, saleCostPerSale: 1 }

  it('conditiecorrectie alleen als je die conditie hebt ingesteld', () => {
    expect(conditionEstimate(10, 'LP', settings)).toEqual({ value: 6, pct: 60 })
    expect(conditionEstimate(10, 'NM', settings)).toBeNull()
    expect(conditionEstimate(10, null, settings)).toBeNull()
  })

  it('netto-opbrengst: zonder kosteninstellingen geen schatting', () => {
    expect(netEstimate(10, 2, EMPTY_SETTINGS)).toBeNull()
    // per stuk 10 × 0,95 − 1 = 8,50
    expect(netEstimate(10, 2, settings)).toBe(17)
  })
})

describe('growthSplit', () => {
  const snaps = [
    { tcgdexId: 'a', takenOn: '2026-10-01', trend: 10, trendHolo: null },
    { tcgdexId: 'a', takenOn: '2026-10-10', trend: 12, trendHolo: null },
    { tcgdexId: 'b', takenOn: '2026-10-10', trend: 5, trendHolo: null },
  ]

  it('scheidt prijsstijging van nieuwe aankopen', () => {
    const s = growthSplit(
      [
        { tcgdexId: 'a', quantity: 2, reverse: false, acquiredOn: '2026-09-01' }, // al in bezit: +2 × 2
        { tcgdexId: 'b', quantity: 1, reverse: false, acquiredOn: '2026-10-05' }, // nieuw: 5
      ],
      snaps,
    )
    expect(s).toEqual({ from: '2026-10-01', to: '2026-10-10', priceEffect: 4, newPurchases: 5, unpriced: 0 })
  })

  it('zonder twee opnamedagen geen grafiek of splitsing', () => {
    expect(growthSplit([], snaps.slice(0, 1))).toBeNull()
  })

  it('geen prijs op de begindatum: niet meegeteld maar wel gemeld', () => {
    const s = growthSplit([{ tcgdexId: 'b', quantity: 3, reverse: false, acquiredOn: '2026-01-01' }], snaps)
    expect(s?.unpriced).toBe(3)
    expect(s?.priceEffect).toBe(0)
  })
})

describe('parseSettings', () => {
  it('neemt alleen geldige waarden over; leeg = niet ingesteld', async () => {
    const { parseSettings } = await import('./valuationDb')
    expect(parseSettings({ condition_pct: { NM: 100, XX: 50, LP: 'abc' }, sale_fee_pct: 5, sale_cost_per_sale: -1 })).toEqual({
      conditionPct: { NM: 100 },
      saleFeePct: 5,
      saleCostPerSale: null,
      defaults: { language: null, condition: null, set_code: null, location_id: null },
    })
    expect(parseSettings(null)).toEqual(EMPTY_SETTINGS)
  })
})

describe('collectionBreakdown', () => {
  it('houdt kosten, marktwaarde, eigen waardering en netto apart; onbekend telt niet als 0', async () => {
    const { collectionBreakdown } = await import('./valuation')
    const cards = [
      { id: 'a', quantity: 2, ownership: 'owned' as const, purchase_price: 3 },
      { id: 'b', quantity: 1, ownership: 'owned' as const, purchase_price: null },
      { id: 'c', quantity: 4, ownership: 'incoming' as const, purchase_price: 1 },
      { id: 'd', quantity: 1, ownership: 'sold' as const, purchase_price: 9 },
    ]
    const market = (id: string): number | null => (id === 'a' ? 5 : null)
    const own = (id: string): number | null => (id === 'b' ? 20 : null)
    const r = collectionBreakdown(cards, market, own, EMPTY_SETTINGS)
    expect(r).toEqual({
      copies: 3,
      incoming: 4,
      cost: { amount: 6, unknown: 1 },
      market: { amount: 10, unknown: 1 },
      yours: { amount: 20, copies: 1 },
      net: null,
    })
    const withCosts = collectionBreakdown(cards, market, own, { ...EMPTY_SETTINGS, saleFeePct: 10, saleCostPerSale: 1 })
    // a: per stuk 5 × 0,9 − 1 = 3,50; 2 stuks
    expect(withCosts.net).toEqual({ amount: 7, copies: 2 })
  })
})
