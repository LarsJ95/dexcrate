import { describe, expect, it } from 'vitest'
import { chsLocalId, compactDataset } from './chsData'
import { CHS_FIXTURE } from './chsData.fixture'

describe('chsLocalId', () => {
  it('nummer zonder totaal; Gem Pack soort + uitvoering; zonder cijfers geen nummer', () => {
    expect(chsLocalId('062/208')).toBe('062')
    expect(chsLocalId('15 02/07')).toBe('1502')
    expect(chsLocalId('394/SV-P')).toBe('394')
    expect(chsLocalId('SV-P')).toBe(null)
  })
})

describe('compactDataset', () => {
  const sets = compactDataset(CHS_FIXTURE)
  const set = sets.find((s) => s.id === 'CSV9.5C')

  it('sets met kaarten; "补充包" uit de naam; officiële telling', () => {
    expect(sets.map((s) => s.id)).toEqual(['CSV9.5C', 'CBB4C'])
    expect(set).toMatchObject({ name: '太晶盛聚', releaseDate: '2026-06-12', official: 208 })
  })

  it('één kaart per nummer (gewone uitvoering), spiegeluitvoering = reverse holo', () => {
    expect(set?.cards.map((c) => c.localId)).toEqual(['019', '062', '067', '068', '173'])
    expect(set?.cards[1]).toEqual({
      localId: '062',
      name: '凯西',
      dexId: 63,
      type: 'Psychic',
      rarity: 'Common',
      variants: ['normal', 'reverse'],
      img: 'img/482/155.png',
      illustrator: 'Kariya',
    })
  })

  it('ex zonder Pokédex-nummer krijgt dat van de soort; trainer zonder type en nummer', () => {
    expect(set?.cards.find((c) => c.localId === '068')).toMatchObject({ dexId: 196, rarity: 'Double rare', variants: ['holo'] })
    expect(set?.cards.find((c) => c.localId === '173')).toMatchObject({ name: '紧急滑板', dexId: null, type: null })
  })

  it('Gem Pack: tekens zijn geen spiegeluitvoering, zeldzaamheid onbekend', () => {
    const gem = sets.find((s) => s.id === 'CBB4C')
    expect(gem?.cards.map((c) => [c.localId, c.rarity, c.variants, c.type])).toEqual([
      ['1502', null, null, 'Colorless'],
      ['1505', null, null, 'Colorless'],
    ])
  })

  it('onbekende vorm: leeg', () => {
    expect(compactDataset(null)).toEqual([])
    expect(compactDataset({ collections: 'x' })).toEqual([])
  })
})
