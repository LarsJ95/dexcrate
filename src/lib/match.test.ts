import { describe, expect, it } from 'vitest'
import { levenshtein, nameSimilarity, searchTerms } from './match'

describe('levenshtein', () => {
  it('telt bewerkingen', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('mew', 'mew')).toBe(0)
  })
})

describe('nameSimilarity', () => {
  it('negeert hoofdletters, accenten en leestekens', () => {
    expect(nameSimilarity('Mew EX', 'Mew ex')).toBe(1)
    expect(nameSimilarity("Professor's Research", 'Professors Research')).toBe(1)
    expect(nameSimilarity('Pokémon', 'Pokemon')).toBe(1)
  })

  it('typo scoort hoog, andere kaart laag', () => {
    expect(nameSimilarity('Charizrd EX', 'Charizard ex')).toBeGreaterThan(0.85)
    expect(nameSimilarity('Litten', 'Arbok')).toBeLessThan(0.5)
  })

  it('lege naam → 0', () => {
    expect(nameSimilarity('', 'Mew')).toBe(0)
  })
})

describe('searchTerms', () => {
  it('maakt steeds kortere zoektermen en laat taalmarkering en suffixen weg', () => {
    expect(searchTerms('Mega Darkrai EX JAPAN')).toEqual(['Mega Darkrai EX', 'Darkrai', 'Dark'])
    expect(searchTerms('Mew')).toEqual(['Mew'])
  })
})
