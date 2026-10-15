import { describe, expect, it } from 'vitest'
import { parseDexId, parseRarity, parseSuffix, parseTypes, rarityRule } from './cardTraits'

describe('parseTypes', () => {
  it('houdt alleen bekende energietypes', () => {
    expect(parseTypes(['Fire', 'Feuer', 3])).toEqual(['Fire'])
    expect(parseTypes(undefined)).toEqual([])
  })
})

describe('parseDexId', () => {
  it('neemt het eerste geldige nummer', () => {
    expect(parseDexId([6])).toBe(6)
    expect(parseDexId([])).toBeNull()
    expect(parseDexId(['6'])).toBeNull()
    expect(parseDexId(null)).toBeNull()
  })
})

describe('parseRarity en parseSuffix', () => {
  it('geeft null bij leeg of "None"', () => {
    expect(parseRarity(' Double rare ')).toBe('Double rare')
    expect(parseRarity('None')).toBeNull()
    expect(parseRarity('')).toBeNull()
    expect(parseSuffix('ex')).toBe('ex')
    expect(parseSuffix(undefined)).toBeNull()
  })
})

describe('rarityRule', () => {
  it('koppelt zeldzaamheid aan glans en symbolen, ongeacht hoofdletters', () => {
    expect(rarityRule('Special illustration rare').foil).toBe('special')
    expect(rarityRule('Ultra Rare').symbols).toHaveLength(2)
    expect(rarityRule('hyper rare').foil).toBe('gold')
    expect(rarityRule('Common').foil).toBe('none')
  })
  it('valt bij onbekende of geërfde namen terug op niets', () => {
    expect(rarityRule('Selten, besondere Illustration').rank).toBe(0)
    expect(rarityRule('toString').rank).toBe(0)
    expect(rarityRule(null).symbols).toEqual([])
  })
})
