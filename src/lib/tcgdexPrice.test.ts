// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'en/sv01-001'
const STORE = `tcgdex:price:v2:${KEY}`
const HOUR = 60 * 60 * 1000

/** TCGdex-antwoord met een Cardmarket-trendprijs. */
const card = (trend: number) => ({ id: 'sv01-001', localId: '001', name: 'Sprigatito', pricing: { cardmarket: { unit: 'EUR', trend } } })
const stored = (trend: number, ageMs: number): void => {
  localStorage.setItem(STORE, JSON.stringify({ t: Date.now() - ageMs, v: { ...card(trend).pricing.cardmarket, idProduct: null, updated: null, low: null, avg1: null, avg7: null, avg30: null, trendHolo: null, lowHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null } }))
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  fetchMock = vi.fn(async () => new Response(JSON.stringify(card(2)), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('getCardPrice: verlopen prijs meteen, op de achtergrond verversen', () => {
  it('verse prijs (< 6 uur): uit de opslag, geen verzoek', async () => {
    stored(1, 1 * HOUR)
    const { getCardPrice } = await import('./tcgdex')
    expect((await getCardPrice(KEY))?.trend).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verlopen prijs (8 uur): meteen de oude, daarna de nieuwe (ook in de opslag)', async () => {
    stored(1, 8 * HOUR)
    const { getCardPrice } = await import('./tcgdex')
    expect((await getCardPrice(KEY))?.trend).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(async () => expect((await getCardPrice(KEY))?.trend).toBe(2))
    expect(JSON.parse(localStorage.getItem(STORE) ?? '{}').v.trend).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('te oud (> 7 dagen) of niets bewaard: eerst ophalen', async () => {
    stored(1, 8 * 24 * HOUR)
    const { getCardPrice } = await import('./tcgdex')
    expect((await getCardPrice(KEY))?.trend).toBe(2)
  })

  it('ophalen mislukt: niet onthouden, volgende keer opnieuw', async () => {
    fetchMock.mockResolvedValueOnce(new Response('kapot', { status: 500 }))
    const { getCardPrice } = await import('./tcgdex')
    await expect(getCardPrice(KEY)).rejects.toThrow()
    expect((await getCardPrice(KEY))?.trend).toBe(2)
  })
})
