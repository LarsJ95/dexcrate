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
  it('oudste sets eerst; onbekende sets blijven achteraan', () => {
    const sorted = sortHits([hit('x-1', 'x', -1), hit('sv03.5-173', 'sv03.5', 5), hit('base1-58', 'base1', 0), hit('sv03.5-25', 'sv03.5', 5)], 'oldest')
    expect(sorted.map((h) => h.card.id)).toEqual(['base1-58', 'sv03.5-25', 'sv03.5-173', 'x-1'])
  })
})

describe('zoekparameters en bladeren', () => {
  it('filters gaan exact naar TCGdex; Rare Holo telt ook Holo Rare; achtervoegsel alleen in het Engels', async () => {
    const { cardQuery } = await import('./tcgdex')
    expect(cardQuery('en', 'pikachu', { rarity: 'Illustration rare' })).toBe('name=pikachu&rarity=eq:Illustration%20rare')
    expect(cardQuery('en', '', { rarity: 'Rare Holo', type: 'Fire', suffix: 'ex' })).toBe('rarity=eq:Rare%20Holo%7CHolo%20Rare&types=eq:Fire&suffix=eq:ex')
    expect(cardQuery('ja', 'リザードン', { suffix: 'ex' })).toBe(`name=${encodeURIComponent('リザードン')}`)
  })
  it('zonder zoekterm alleen actief met een filter', async () => {
    const { catalogActive } = await import('./catalogSearch')
    expect(catalogActive('', {})).toBe(false)
    expect(catalogActive('', { rarity: 'ACE SPEC Rare' })).toBe(true)
    expect(catalogActive('p', { rarity: 'ACE SPEC Rare' })).toBe(false)
    expect(catalogActive('pi', {})).toBe(true)
    // Alleen een set gekozen: de hele set bekijken.
    expect(catalogActive('', {}, 'sv03.5')).toBe(true)
  })
})
