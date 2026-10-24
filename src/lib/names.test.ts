import { describe, expect, it } from 'vitest'
import { speciesName, toSpecies } from './names'

describe('Pokémon-lijst (Pokémon pack)', () => {
  it('nette namen uit PokeAPI', () => {
    expect(speciesName('pikachu')).toBe('Pikachu')
    expect(speciesName('mr-mime')).toBe('Mr. Mime')
    expect(speciesName('nidoran-f')).toBe('Nidoran♀')
    expect(speciesName('ho-oh')).toBe('Ho-Oh')
    expect(speciesName('tapu-koko')).toBe('Tapu Koko')
    expect(speciesName('chi-yu')).toBe('Chi-Yu')
  })

  it('nummer uit de url; rommel en nummers buiten 1–1025 overgeslagen', () => {
    const list = toSpecies({
      results: [
        { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon-species/1/' },
        { name: 'pikachu', url: 'https://pokeapi.co/api/v2/pokemon-species/25/' },
        { name: 'kapot', url: 'geen-nummer' },
        { name: 'te-hoog', url: 'https://pokeapi.co/api/v2/pokemon-species/1026/' },
        null,
      ],
    })
    expect(list).toEqual([
      { dexId: 1, name: 'Bulbasaur' },
      { dexId: 25, name: 'Pikachu' },
    ])
    expect(toSpecies(null)).toEqual([])
  })
})
