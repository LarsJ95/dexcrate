import { describe, expect, it } from 'vitest'
import { parseCatalogQuery, sortHits, type CatalogHit } from './catalogSearch'

describe('parseCatalogQuery', () => {
  it('haalt een kaartnummer achteraan los', () => {
    expect(parseCatalogQuery('Pikachu 25')).toEqual({ name: 'Pikachu', number: '25' })
    expect(parseCatalogQuery(' pikachu  #173 ')).toEqual({ name: 'pikachu', number: '173' })
    expect(parseCatalogQuery('Mew ex')).toEqual({ name: 'Mew ex', number: null })
    expect(parseCatalogQuery('151')).toEqual({ name: '151', number: null })
  })
})

describe('sortHits', () => {
  const hit = (id: string, setId: string, order: number): CatalogHit => ({
    card: { id, localId: id.split('-')[1], name: 'Pikachu', image: null },
    setId,
    set: null,
    order,
  })
  it('zet nieuwste sets eerst en sorteert binnen een set op nummer', () => {
    const sorted = sortHits([hit('base1-58', 'base1', 0), hit('sv03.5-173', 'sv03.5', 5), hit('sv03.5-25', 'sv03.5', 5), hit('x-1', 'x', -1)])
    expect(sorted.map((h) => h.card.id)).toEqual(['sv03.5-25', 'sv03.5-173', 'base1-58', 'x-1'])
  })
})
