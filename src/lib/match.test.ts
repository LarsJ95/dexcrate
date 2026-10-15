import { describe, expect, it } from 'vitest'
import { levenshtein, nameSimilarity, searchTerms } from './match'
import { isNonLatin, speciesSlug } from './names'

describe('speciesSlug', () => {
  it('maakt PokeAPI-soortnamen van kaartnamen', () => {
    expect(speciesSlug('Morpeko')).toBe('morpeko')
    expect(speciesSlug('Mega Darkrai EX JAPAN')).toBe('darkrai')
    expect(speciesSlug("Lillie's Clefairy ex")).toBe('clefairy')
    expect(speciesSlug('Mr. Mime')).toBe('mr-mime')
    expect(speciesSlug('Oranguru V')).toBe('oranguru')
    expect(speciesSlug('Mega Charizard X ex')).toBe('charizard')
    expect(speciesSlug("Farfetch'd")).toBe('farfetchd')
    expect(speciesSlug('Nidoran♀')).toBe('nidoran-f')
    expect(speciesSlug('Flabébé')).toBe('flabebe')
    expect(speciesSlug('Tapu Koko VMAX')).toBe('tapu-koko')
  })

  it('herkent zelf getypte Aziatische namen', () => {
    expect(isNonLatin('莫鲁贝可')).toBe(true)
    expect(isNonLatin('モルペコ')).toBe(true)
    expect(isNonLatin('Pokémon Mr. Mime')).toBe(false)
  })
})

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
