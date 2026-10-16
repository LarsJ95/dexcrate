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

describe('Overview: titels, regio\'s en type-team', async () => {
  const { trainerTitle, generationRange, typeTeam, teamGaps } = await import('./trainer')
  it('titel groeit met badges', () => {
    expect(trainerTitle(0)).toEqual({ title: 'Youngster', next: { title: 'Rookie Trainer', badges: 1 } })
    expect(trainerTitle(3).title).toBe('Ace Trainer')
    expect(trainerTitle(8)).toEqual({ title: 'Champion', next: null })
  })
  it('generaties en team', () => {
    expect(generationRange(1)).toEqual({ first: 1, last: 151 })
    expect(generationRange(9)).toEqual({ first: 906, last: 1025 })
    const team = typeTeam([o(4, ['Fire'], 3), o(7, ['Water'], 1)])
    expect(team[0]).toEqual({ type: 'Fire', count: 3, strongAgainst: ['Grass', 'Metal'], weakTo: 'Water' })
    expect(teamGaps(team)).not.toContain('Grass')
    expect(teamGaps(team)).toContain('Lightning')
  })
})

describe('regio bij Pokédex-nummer', async () => {
  const { regionOf } = await import('./trainer')
  it('Kanto t/m Paldea', () => {
    expect(regionOf(25)).toEqual({ gen: 1, region: 'Kanto' })
    expect(regionOf(573)).toEqual({ gen: 5, region: 'Unova' })
    expect(regionOf(1025)).toEqual({ gen: 9, region: 'Paldea' })
    expect(regionOf(0)).toBeNull()
    expect(regionOf(2000)).toBeNull()
  })
})
