import { describe, expect, it } from 'vitest'
import { limitlessSymbol, parsePtcgSets, ptcgImagesFor, setLogoSources, setSymbolSources } from './setIcons'

const ptcg = parsePtcgSets({
  data: [
    { name: 'Temporal Forces', images: { logo: 'https://images.pokemontcg.io/sv5/logo.png', symbol: 'https://images.pokemontcg.io/sv5/symbol.png' } },
    { name: 'Scarlet & Violet Black Star Promos', images: { logo: 'https://images.pokemontcg.io/svp/logo.png', symbol: 'https://images.pokemontcg.io/svp/symbol.png' } },
    { name: 'Kapot', images: { logo: 'javascript:alert(1)', symbol: 42 } },
    'rommel',
  ],
})

describe('set-icoontjes', () => {
  it('pokemontcg.io: op naam, met aliassen; alleen https-adressen', () => {
    expect(ptcgImagesFor(ptcg, 'sv05', 'Temporal Forces')?.logo).toBe('https://images.pokemontcg.io/sv5/logo.png')
    expect(ptcgImagesFor(ptcg, 'svp', 'SVP Black Star Promos')?.symbol).toBe('https://images.pokemontcg.io/svp/symbol.png')
    expect(ptcgImagesFor(ptcg, 'x', 'Kapot')).toBeNull()
    expect(parsePtcgSets(null).size).toBe(0)
  })

  it('Limitless: Engels op afkorting, Japans op set-id, rare tekens geweigerd', () => {
    expect(limitlessSymbol('en', 'sv05', 'TEF')).toBe('https://s3.limitlesstcg.com/sets/en/TEF_SM.png')
    expect(limitlessSymbol('en', 'sv05', null)).toBeNull()
    expect(limitlessSymbol('en', 'swsh12.5gg', 'CRZ:GG')).toBeNull()
    expect(limitlessSymbol('ja', 'SV8', null)).toBe('https://s3.limitlesstcg.com/sets/jp/SV8.png')
    expect(limitlessSymbol('ja', '../x', null)).toBeNull()
    expect(limitlessSymbol('ko', 'SV8', 'X')).toBeNull()
  })

  it('volgorde: TCGdex-logo, dan pokemontcg.io; pokemontcg.io alleen voor Engels', () => {
    const set = { lang: 'en' as const, setId: 'sv05', name: 'Temporal Forces', logo: 'https://assets.tcgdex.net/en/sv/sv05/logo' }
    expect(setLogoSources(set, ptcg)).toEqual(['https://assets.tcgdex.net/en/sv/sv05/logo.webp', 'https://images.pokemontcg.io/sv5/logo.png'])
    expect(setLogoSources({ ...set, logo: null }, undefined)).toEqual([])
    expect(setSymbolSources(set, ptcg)).toEqual(['https://images.pokemontcg.io/sv5/symbol.png'])
    expect(setSymbolSources({ ...set, lang: 'ja' }, ptcg)).toEqual([])
  })
})
