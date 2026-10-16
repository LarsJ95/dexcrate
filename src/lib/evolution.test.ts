import { describe, expect, it } from 'vitest'
import { parseChain } from './evolution'

const sp = (id: number) => ({ url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` })

describe('evolutielijnen', () => {
  it('keten → paden, ook met vertakkingen', () => {
    const eevee = { chain: { species: sp(133), evolves_to: [{ species: sp(134), evolves_to: [] }, { species: sp(135), evolves_to: [] }] } }
    expect(parseChain(eevee)).toEqual([
      [133, 134],
      [133, 135],
    ])
    const charmander = { chain: { species: sp(4), evolves_to: [{ species: sp(5), evolves_to: [{ species: sp(6), evolves_to: [] }] }] } }
    expect(parseChain(charmander)).toEqual([[4, 5, 6]])
    expect(parseChain(null)).toEqual([])
  })
})
