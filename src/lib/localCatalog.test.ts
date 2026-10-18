// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalKey, localCardInfo, localSet, localSetIdForAbbr, localSetSummaries, searchLocal } from './localCatalog'
import { findCandidates } from './match'
import { findExact, getCardInfo, getCardPrice, getSetList } from './tcgdex'

describe('eigen catalogus: Pokémon TCG Classic', () => {
  it('drie decks van 34 kaarten, genummerd zoals gedrukt', () => {
    const sets = localSetSummaries()
    expect(sets.map((s) => s.abbr)).toEqual(['CLV', 'CLC', 'CLB'])
    for (const s of sets) expect(localSet(s.id)?.cards).toHaveLength(34)
    const clc = localSet('clc')?.cards ?? []
    // Steekproef tegen de bron (TCGCollector/PriceCharting).
    expect(clc[0]).toMatchObject({ id: 'clc-001', localId: '001', name: 'Charmander' })
    expect(clc[9]).toMatchObject({ id: 'clc-010', name: 'Voltorb' })
    expect(clc[17].name).toBe('Bill')
    expect(clc[33].name).toBe('Lightning Energy')
    expect(localSet('clv')?.cards[16].name).toBe('Lugia ex')
    expect(localSet('clb')?.cards[9].name).toBe('Suicune ex')
    expect(localSet('clb')?.cards[20].name).toBe('Drops in the Ocean')
  })

  it('kaartinfo met type en Pokédex-nummer; trainers zonder', () => {
    expect(localCardInfo('en/clc-010')).toMatchObject({ name: 'Voltorb', types: ['Lightning'], dexId: 100, set: { id: 'clc' } })
    expect(localCardInfo('en/clv-017')).toMatchObject({ name: 'Lugia ex', suffix: 'ex', dexId: 249 })
    expect(localCardInfo('en/clc-018')).toMatchObject({ name: 'Bill', types: [], dexId: null })
    expect(localCardInfo('en/clc-035')).toBeNull()
    expect(localCardInfo('en/base1-67')).toBeNull()
    expect(localCardInfo('ja/clc-010')).toBeNull()
  })

  it('afkorting, zoeken en sleutels', () => {
    expect(localSetIdForAbbr('clc')).toBe('clc')
    expect(localSetIdForAbbr('MEW')).toBeNull()
    expect(searchLocal('voltorb').map((c) => c.id)).toEqual(['clc-010'])
    expect(searchLocal('pikachu', 'Fire')).toEqual([])
    expect(isLocalKey('en/clb-033')).toBe(true)
    expect(isLocalKey('en/cel25c-4')).toBe(false)
  })
})

describe('koppelen via tcgdex.ts', () => {
  const fetchMock = vi.fn((input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/en/sets')) return Promise.resolve(new Response('[]'))
    if (url.includes('/en/cards?')) return Promise.resolve(new Response('[]'))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('CLC 10 vindt Voltorb zonder TCGdex te vragen', async () => {
    expect(await findExact('en', 'CLC', '10')).toMatchObject({ key: 'en/clc-010', name: 'Voltorb', setId: 'clc' })
    expect((await getCardInfo('en/clc-010'))?.dexId).toBe(100)
    expect(await getCardPrice('en/clc-010')).toBeNull()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('clc'))).toBe(false)
  })

  it('scan of koppelscherm: beste kandidaat, en de set staat in de setlijst', async () => {
    const [best] = await findCandidates({ name: 'Voltorb', set_code: 'CLC', card_number: '010', set_total: '034' }, 'en')
    expect(best).toMatchObject({ key: 'en/clc-010', setName: 'Pokémon TCG Classic (Charizard)' })
    expect((await getSetList('en')).get('clc')?.official).toBe(34)
  })
})
