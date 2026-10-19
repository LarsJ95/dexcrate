import { describe, expect, it, vi } from 'vitest'
import type { CardInfo, CardmarketPrice } from './tcgdex'

vi.mock('./tcgdex', async (importOriginal) => ({ ...(await importOriginal<typeof import('./tcgdex')>()), getCardInfo: vi.fn(), getCardPrice: vi.fn() }))

const { getCardInfo, getCardPrice } = await import('./tcgdex')
const { ALL_VARIANTS, fitVariant, variantFacts, variantOptions, variantPriceGap } = await import('./variantChoice')

const price = (trend: number | null, trendHolo: number | null): CardmarketPrice => ({
  idProduct: 1,
  updated: null,
  trend,
  low: null,
  avg1: null,
  avg7: null,
  avg30: null,
  trendHolo,
  lowHolo: null,
  avg1Holo: null,
  avg7Holo: null,
  avg30Holo: null,
})

describe('variantOptions', () => {
  it('catalogus bekend: alleen die; onbekend of leeg: alles', () => {
    expect(variantOptions(['holo'])).toEqual(['holo'])
    expect(variantOptions(null)).toEqual(ALL_VARIANTS)
    expect(variantOptions([])).toEqual(ALL_VARIANTS)
  })
})

describe('fitVariant', () => {
  it('gelezen uitvoering blijft als die bestaat (of als de catalogus het niet weet)', () => {
    expect(fitVariant('reverse', ['normal', 'reverse'])).toBe('reverse')
    expect(fitVariant('reverse', null)).toBe('reverse')
    expect(fitVariant(null, null)).toBe(null)
  })

  it('bestaat niet: de enige die bestaat, anders onbekend', () => {
    expect(fitVariant('reverse', ['holo'])).toBe('holo')
    expect(fitVariant(null, ['holo'])).toBe('holo')
    expect(fitVariant('holo', ['normal', 'reverse'])).toBe(null)
  })
})

describe('variantPriceGap', () => {
  it('Dragonite: holo €0,74, reverse holo €3,08 → vragen', () => {
    expect(variantPriceGap(price(0.74, 3.08), ['holo', 'reverse'])).toEqual({ base: 'holo', baseValue: 0.74, reverseValue: 3.08 })
  })

  it('klein verschil (onder €0,25) → niet vragen', () => {
    expect(variantPriceGap(price(0.05, 0.12), ['normal', 'reverse'])).toBe(null)
    expect(variantPriceGap(price(1, 1.25), ['normal', 'reverse'])).not.toBe(null)
  })

  it('niet te bepalen → niet vragen', () => {
    // Geen reverse holo, onbekende catalogus, twee gewone uitvoeringen (welke hoort bij de basisprijs?), prijs ontbreekt.
    expect(variantPriceGap(price(0.74, 3.08), ['holo'])).toBe(null)
    expect(variantPriceGap(price(0.74, 3.08), null)).toBe(null)
    expect(variantPriceGap(price(0.74, 3.08), ['normal', 'holo', 'reverse'])).toBe(null)
    expect(variantPriceGap(price(0.74, null), ['holo', 'reverse'])).toBe(null)
    expect(variantPriceGap(null, ['holo', 'reverse'])).toBe(null)
  })
})

describe('variantFacts', () => {
  const info = (variants: CardInfo['variants']): CardInfo => ({ key: 'en/sv03.5-149', lang: 'en', name: 'Dragonite', localId: '149', image: null, variants, set: { id: 'sv03.5', name: '151', logo: null } })

  it('uitvoeringen en prijsverschil van de kaart', async () => {
    vi.mocked(getCardInfo).mockResolvedValueOnce(info(['holo', 'reverse']))
    vi.mocked(getCardPrice).mockResolvedValueOnce(price(0.74, 3.08))
    expect(await variantFacts('en/sv03.5-149')).toEqual({ variants: ['holo', 'reverse'], askVariant: true })
  })

  it('geen kaart of een fout: onbekend, zonder te blokkeren', async () => {
    expect(await variantFacts(null)).toEqual({ variants: null, askVariant: false })
    vi.mocked(getCardInfo).mockRejectedValueOnce(new Error('TCGdex 502'))
    vi.mocked(getCardPrice).mockResolvedValueOnce(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await variantFacts('en/sv03.5-149')).toEqual({ variants: null, askVariant: false })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
