import { describe, expect, it } from 'vitest'
import { badges, dominantType, partnerDexId, pokedexProgress, trainerName, type OwnedInfo } from './trainer'

const o = (dexId: number | null, types: OwnedInfo['types'], quantity = 1, value: number | null = 1): OwnedInfo => ({ dexId, types, quantity, value })

describe('Overview: trainer', () => {
  it('dominant type telt exemplaren en slaat Colorless over', () => {
    expect(dominantType([o(1, ['Colorless'], 5), o(4, ['Fire'], 2), o(7, ['Water'], 1)])).toBe('Fire')
    expect(dominantType([o(16, ['Colorless'], 3)])).toBeNull()
  })

  it('Pokédex: uniek, per generatie, rare nummers genegeerd', () => {
    const p = pokedexProgress([25, 25, 1, 152, 1025, 0, 2000])
    expect(p.caught).toBe(4)
    expect(p.total).toBe(1025)
    expect(p.perGen[0]).toEqual({ gen: 1, caught: 2, total: 151 })
    expect(p.perGen[1]).toEqual({ gen: 2, caught: 1, total: 100 })
    expect(p.perGen[8].caught).toBe(1)
  })

  it('partner: meeste exemplaren, bij gelijkstand de waardevolste', () => {
    expect(partnerDexId([o(25, null, 1, 2), o(25, null, 2, 1), o(6, null, 2, 50)])).toBe(25)
    expect(partnerDexId([o(25, null, 1, 2), o(6, null, 1, 50)])).toBe(6)
    expect(partnerDexId([o(null, null, 9)])).toBeNull()
  })

  it('badges en trainernaam', () => {
    const b = badges({ cards: 43, species: 30, value: 169 })
    expect(b.filter((x) => x.earned).map((x) => x.id)).toEqual(['boulder', 'cascade', 'soul'])
    expect(b.find((x) => x.id === 'thunder')?.progress).toBeCloseTo(0.86)
    expect(trainerName('lars.vanhamburg@hotmail.com')).toBe('Lars')
    expect(trainerName(null)).toBe('Trainer')
  })
})
