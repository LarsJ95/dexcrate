import { describe, expect, it } from 'vitest'
import { normalizeChannel, parsePrice, parseQuantity, splitLanguage } from './excel'
import { langFromName, lookupLang, parseCardmarket, setOfKey, splitKey, stripLangTag } from './tcgdex'

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

  it('geen of andere valuta → null', () => {
    expect(parseCardmarket({})).toBeNull()
    expect(parseCardmarket({ pricing: { cardmarket: { unit: 'USD', trend: 1 } } })).toBeNull()
  })
})
