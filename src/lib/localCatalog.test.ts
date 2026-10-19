// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalKey, localCardInfo, localSet, localSetIdForAbbr, localSetSummaries, searchLocal } from './localCatalog'
import { autoPick, findCandidates, findScanCandidates } from './match'
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

describe('eigen catalogus: Vereenvoudigd Chinees', () => {
  it('drie sets met het juiste aantal kaarten, unieke nummers', () => {
    const sets = localSetSummaries('zh-cn')
    expect(sets.map((s) => [s.id, s.total])).toEqual([
      ['CSMC', 13],
      ['CBB3C', 136],
      ['CBB4C', 196],
    ])
    for (const s of sets) {
      const ids = localSet(s.id, 'zh-cn')?.cards.map((c) => c.localId) ?? []
      expect(new Set(ids).size).toBe(ids.length)
    }
    // Engels ziet ze niet, en andersom.
    expect(localSetSummaries('en').map((s) => s.id)).toEqual(['clv', 'clc', 'clb'])
    expect(localSet('CSMC')).toBeNull()
  })

  it('CSMC: steekproef tegen de bronnen (Cardmarket, advertenties, NipponTCG)', () => {
    const cards = localSet('CSMC', 'zh-cn')?.cards ?? []
    expect(cards.map((c) => c.name)).toEqual(['Charizard', 'Flaaffy', 'Zekrom', 'Dedenne', 'Alcremie', 'Wyrdeer', 'Kleavor', 'Ariados', 'Spiritomb', 'Galarian Obstagoon', 'Druddigon', 'Hoothoot', 'Pikachu'])
    expect(localCardInfo('zh-cn/CSMC-004')).toMatchObject({ lang: 'zh-cn', name: 'Dedenne', localId: '004', dexId: 702, types: [], set: { id: 'CSMC' } })
    expect(localCardInfo('zh-cn/CSMC-013')?.name).toBe('Pikachu')
  })

  it('Gem Packs: soort + uitvoering (steekproef tegen PriceCharting/pikaqian)', () => {
    const v3 = localSet('CBB3C', 'zh-cn')?.cards ?? []
    expect(v3.filter((c) => c.localId.startsWith('14')).map((c) => [c.localId, c.name])).toEqual(['01', '02', '03', '04', '05', '06', '07'].map((v) => [`14${v}`, 'Morpeko']))
    expect(v3.find((c) => c.localId === '0107')?.name).toBe('Clefable ex')
    expect(v3.find((c) => c.localId === '0207')?.name).toBe('Meowth')
    expect(v3.find((c) => c.localId === '1904')?.name).toBe('Arven')
    expect(v3.at(-1)).toMatchObject({ localId: '2006', name: 'Luminous Energy' })
    expect(localCardInfo('zh-cn/CBB3C-1407')).toMatchObject({ name: 'Morpeko', dexId: 877, suffix: null })
    expect(localCardInfo('zh-cn/CBB3C-1807')).toMatchObject({ name: 'Annihilape ex', suffix: 'ex' })
    expect(localCardInfo('zh-cn/CBB3C-2001')).toMatchObject({ name: 'Fighting Energy', dexId: null })
    const v4 = localSet('CBB4C', 'zh-cn')?.cards ?? []
    expect(v4.filter((c) => c.localId.startsWith('23')).every((c) => c.name === 'Mudsdale')).toBe(true)
    expect(localCardInfo('zh-cn/CBB4C-2807')).toMatchObject({ name: 'Flutter Mane', dexId: 987 })
  })

  it('set-id zonder hoofdletters te vinden; sleutels alleen in de echte schrijfwijze', () => {
    expect(localSet('csMC', 'zh-cn')?.summary.id).toBe('CSMC')
    expect(localSetIdForAbbr('cbb3c', 'zh-cn')).toBe('CBB3C')
    expect(isLocalKey('zh-cn/CSMC-004')).toBe(true)
    expect(isLocalKey('zh-cn/csmc-004')).toBe(false)
    expect(isLocalKey('zh-tw/CSMC-004')).toBe(false)
    expect(localCardInfo('zh-cn/CSMC-014')).toBeNull()
    expect(searchLocal('dedenne', undefined, 'zh-cn').map((c) => c.id)).toEqual(['CSMC-004'])
    expect(searchLocal('dedenne')).toEqual([])
  })
})

describe('koppelen via tcgdex.ts', () => {
  const fetchMock = vi.fn((input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/en/sets')) return Promise.resolve(new Response('[]'))
    // TCGdex kent CBB3C, maar zonder kaarten en met een rare telling (7 = uitvoeringen per soort).
    if (url.endsWith('/zh-cn/sets')) return Promise.resolve(new Response(JSON.stringify([{ id: 'CBB3C', name: '宝石包Vol.3', cardCount: { total: 7, official: 7 } }])))
    if (url.endsWith('/zh-tw/sets')) return Promise.resolve(new Response('[]'))
    if (/\/(en|zh-cn|zh-tw)\/cards\?/.test(url)) return Promise.resolve(new Response('[]'))
    if (url.includes('pokemon-species/dedenne')) return Promise.resolve(new Response(JSON.stringify({ names: [{ name: '咚咚鼠', language: { name: 'zh-hans' } }, { name: '咚咚鼠', language: { name: 'zh-hant' } }] })))
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

  it('Chinees: CSMC 004 en Gem Pack "14 05" zonder TCGdex; eigen lijst vervangt de lege TCGdex-set', async () => {
    expect(await findExact('zh-cn', 'csMC', '004')).toMatchObject({ key: 'zh-cn/CSMC-004', name: 'Dedenne', setId: 'CSMC' })
    expect(await findExact('zh-cn', 'CBB3C', '14 05')).toMatchObject({ key: 'zh-cn/CBB3C-1405', name: 'Morpeko' })
    expect(await findExact('zh-cn', 'CBB4C', '2301')).toMatchObject({ key: 'zh-cn/CBB4C-2301', name: 'Mudsdale' })
    expect((await getSetList('zh-cn')).get('CBB3C')).toMatchObject({ name: 'Gem Pack Vol. 3', official: 136 })
    expect(await getCardPrice('zh-cn/CSMC-004')).toBeNull()
    expect(fetchMock.mock.calls.some(([u]) => /CSMC|CBB3C-|CBB4C/i.test(String(u)))).toBe(false)
  })

  it('scan: Dedenne CSMC 004/012 gelezen als Traditioneel Chinees → toch de eigen CSMC-kaart', async () => {
    const list = await findScanCandidates({ name: 'Dedenne', set_code: 'CSMC', card_number: '004', set_total: '012' }, 'zh-tw')
    expect(autoPick(list)).toMatchObject({ key: 'zh-cn/CSMC-004', setName: 'Pokémon Card Display Set Gift Box Charizard' })
  })
})
