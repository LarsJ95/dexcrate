import { describe, expect, it } from 'vitest'
import { normalizeChannel, parsePrice, parseQuantity, splitLanguage } from './excel'
import { findTcgplayerId, langFromName, lookupLang, parseCardmarket, parseVariants, setOfKey, splitKey, stripLangTag } from './tcgdex'
import { imageCandidates, imageCandidatesForKey, limitlessJpUrl, tcgplayerImageUrl } from './cardImages'
import { cardLanguageOf, cardmarketUrl } from './cardmarket'

describe('Excel-velden', () => {
  it('parseQuantity: "3x", "3", spaties; ongeldig → null', () => {
    expect(parseQuantity('3x')).toBe(3)
    expect(parseQuantity(' 2 X ')).toBe(2)
    expect(parseQuantity('1')).toBe(1)
    expect(parseQuantity('0x')).toBeNull()
    expect(parseQuantity('drie')).toBeNull()
  })

  it('parsePrice: punt of komma, euroteken, afronden op centen', () => {
    expect(parsePrice('5,95')).toBe(5.95)
    expect(parsePrice('€ 1.1499999999999999')).toBe(1.15)
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('-1')).toBeNull()
    expect(parsePrice('abc')).toBeNull()
  })

  it('normalizeChannel trekt bekende kanalen gelijk', () => {
    expect(normalizeChannel('Whatsapp')).toBe('WhatsApp')
    expect(normalizeChannel('cardmarket')).toBe('Cardmarket')
    expect(normalizeChannel('Vinted')).toBe('Vinted')
    expect(normalizeChannel('  ')).toBeNull()
  })

  it('splitLanguage haalt JAPAN/CHINA uit de naam', () => {
    expect(splitLanguage('Vivillon JAPAN', 'card')).toEqual({ name: 'Vivillon', language: 'ja' })
    expect(splitLanguage('Morpeko CHINA', 'card')).toEqual({ name: 'Morpeko', language: 'zh-cn' })
    expect(splitLanguage('Mew EX', 'card')).toEqual({ name: 'Mew EX', language: 'en' })
    expect(splitLanguage('Booster Box', 'sealed')).toEqual({ name: 'Booster Box', language: null })
  })
})

describe('TCGdex-sleutels en talen', () => {
  it('splitKey en setOfKey', () => {
    expect(splitKey('en/sv03.5-151')).toEqual({ lang: 'en', cardId: 'sv03.5-151' })
    expect(splitKey('xx/abc')).toBeNull()
    expect(splitKey('geen-slash')).toBeNull()
    expect(setOfKey('en/30th-c-001')).toEqual({ lang: 'en', cardId: '30th-c-001', setId: '30th-c' })
    expect(setOfKey('ja/SV8-107')?.setId).toBe('SV8')
  })

  it('lookupLang: Europese talen delen de Engelse data', () => {
    expect(lookupLang('nl')).toBe('en')
    expect(lookupLang('ja')).toBe('ja')
    expect(lookupLang(null)).toBe('en')
  })

  it('langFromName en stripLangTag', () => {
    expect(langFromName('Dedenne JAPAN')).toBe('ja')
    expect(langFromName('Japanese Oddish')).toBe('en') // alleen het losse woord telt
    expect(stripLangTag('Mega Darkrai EX JAPAN')).toBe('Mega Darkrai EX')
  })
})

describe('parseCardmarket', () => {
  it('leest prijzen en zet 0 om naar null', () => {
    const p = parseCardmarket({
      pricing: { cardmarket: { unit: 'EUR', trend: 0.74, avg30: 0.69, 'trend-holo': 0, 'avg30-holo': null } },
    })
    expect(p?.trend).toBe(0.74)
    expect(p?.avg30).toBe(0.69)
    expect(p?.trendHolo).toBeNull()
    expect(p?.avg30Holo).toBeNull()
  })

  it('neemt het Cardmarket-product-id mee', () => {
    expect(parseCardmarket({ pricing: { cardmarket: { unit: 'EUR', idProduct: 733746 } } })?.idProduct).toBe(733746)
    expect(parseCardmarket({ pricing: { cardmarket: { unit: 'EUR', idProduct: 'x' } } })?.idProduct).toBeNull()
  })

  it('cardmarketUrl: productpagina of zoekopdracht', () => {
    const filters = 'sellerCountry=23&sellerType=0,1,2&sellerReputation=2&language=1&minCondition=3'
    expect(cardmarketUrl(733746, 'Mew ex')).toBe(`https://www.cardmarket.com/en/Pokemon/Products?idProduct=733746&${filters}`)
    expect(cardmarketUrl(null, ' Mew ex 151 ')).toBe(
      `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Mew%20ex%20151&${filters}`,
    )
    expect(cardmarketUrl(733746, 'Mew ex', 'en')).toBe(`https://www.cardmarket.com/en/Pokemon/Products?idProduct=733746&${filters}`)
  })

  it('cardmarketUrl: geen taalfilter bij niet-Engelse kaarten, overige filters blijven', () => {
    expect(cardmarketUrl(733746, 'Mew ex', 'ja')).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products?idProduct=733746&sellerCountry=23&sellerType=0,1,2&sellerReputation=2&minCondition=3',
    )
    expect(cardmarketUrl(null, 'Pikachu', 'nl')).not.toContain('language=')
  })

  it('cardLanguageOf: eigen taalveld, anders uit de sleutel', () => {
    expect(cardLanguageOf('nl', 'en/sv03.5-025')).toBe('nl')
    expect(cardLanguageOf(null, 'ja/SV2a-025')).toBe('ja')
    expect(cardLanguageOf(null, null)).toBeNull()
    expect(cardLanguageOf(null, 'rommel')).toBeNull()
  })

  it('geen of andere valuta → null', () => {
    expect(parseCardmarket({})).toBeNull()
    expect(parseCardmarket({ pricing: { cardmarket: { unit: 'USD', trend: 1 } } })).toBeNull()
  })
})

describe('plaatjesbronnen', () => {
  it('Limitless-URL voor Japanse kaarten: nummer zonder voorloopnullen', () => {
    expect(limitlessJpUrl('M5', '046', 'low')).toBe('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_46_R_JP_SM.png')
    expect(limitlessJpUrl('SV8', '107', 'high')).toBe('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV8/SV8_107_R_JP_LG.png')
    expect(limitlessJpUrl('SV-P', 'SV13', 'low')).toBeNull()
    expect(limitlessJpUrl('../x', '1', 'low')).toBeNull()
  })

  it('volgorde: TCGdex eerst, Japanse terugval alleen voor Aziatische talen', () => {
    expect(imageCandidates('en', 'sv03.5', '151', 'https://assets.tcgdex.net/en/sv/sv03.5/151', 'low')).toEqual([
      'https://assets.tcgdex.net/en/sv/sv03.5/151/low.webp',
    ])
    expect(imageCandidates('ko', 'SV4K', '051', null, 'low')).toEqual([
      'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV4K/SV4K_51_R_JP_SM.png',
    ])
    expect(imageCandidatesForKey('ja/SV8-107', null, 'low')).toEqual([
      'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV8/SV8_107_R_JP_SM.png',
    ])
  })
})

describe('TCGplayer als terugvalbron', () => {
  it('leest het productnummer uit variants_detailed', () => {
    expect(findTcgplayerId({ variants_detailed: [{ thirdParty: { cardmarket: 1 } }, { thirdParty: { tcgplayer: 587687 } }] })).toBe(587687)
    expect(findTcgplayerId({ variants_detailed: [{ thirdParty: { tcgplayer: 'x' } }] })).toBeNull()
    expect(findTcgplayerId({})).toBeNull()
  })

  it('komt als laatste in de keten', () => {
    expect(imageCandidates('ja', 'SV8', '107', null, 'high', 587687)).toEqual([
      'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV8/SV8_107_R_JP_LG.png',
      'https://tcgplayer-cdn.tcgplayer.com/product/587687_400w.jpg',
    ])
    expect(tcgplayerImageUrl(null, 'low')).toBeNull()
  })
})

describe('parseVariants', () => {
  it('geeft alleen de bestaande uitvoeringen (Mega Gardevoir ex: alleen holo)', () => {
    expect(parseVariants({ variants: { firstEdition: false, holo: true, normal: false, reverse: false, wPromo: false } })).toEqual(['holo'])
    expect(parseVariants({ variants: { normal: true, reverse: true, holo: false } })).toEqual(['normal', 'reverse'])
  })

  it('onbekend als TCGdex niets of alleen false meldt', () => {
    expect(parseVariants({})).toBeNull()
    expect(parseVariants({ variants: { normal: false, holo: false } })).toBeNull()
    expect(parseVariants({ variants: 'x' })).toBeNull()
  })
})
