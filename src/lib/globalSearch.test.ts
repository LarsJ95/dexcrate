import { describe, expect, it } from 'vitest'
import { MAX_HITS, findCards, findPages, findSets, ownedPerSet, setsFirst, type SpotPage, type SpotSet } from './globalSearch'
import type { Card } from './types'

const pages: SpotPage[] = [
  { route: 'overview', label: 'Home' },
  { route: 'sets', label: 'Sets' },
  { route: 'backup', label: 'Backup' },
]

const set = (lang: SpotSet['lang'], setId: string, name: string, order = 1, owned = 0): SpotSet => ({ lang, setId, name, logo: null, order, owned })

const card = (id: string, name: string, extra: Partial<Card> = {}): Card =>
  ({ id, name, set_code: null, card_number: null, quantity: 1, kind: 'card', tcgdex_id: null, status: 'collection', ...extra }) as Card

describe('findPages', () => {
  it('zonder tekst alle pagina’s; met tekst ook op extra woorden', () => {
    expect(findPages(pages, '')).toHaveLength(3)
    expect(findPages(pages, 'binder').map((p) => p.label)).toEqual(['Sets'])
    expect(findPages(pages, 'export').map((p) => p.label)).toEqual(['Backup'])
    expect(findPages(pages, 'zzz')).toEqual([])
  })
})

describe('findSets en setsFirst', () => {
  const sets = [set('en', 'sv03.5', '151', 30), set('ja', 'SV2a', 'ポケモンカード151', 20), set('en', 'det1', 'Detective Pikachu', 10), set('en', 'swsh7', 'Evolving Skies', 25)]

  it('sets uit alle talen; afkorting (MEW → sv03.5) bovenaan', () => {
    expect(findSets(sets, '151').map((s) => `${s.lang}/${s.setId}`)).toEqual(['en/sv03.5', 'ja/SV2a'])
    expect(findSets(sets, 'mew', { lang: 'en', setId: 'sv03.5' })[0].setId).toBe('sv03.5')
    expect(findSets(sets, '')).toEqual([])
  })

  it('setnaam of afkorting: sets eerst; Pokémon-naam: eigen kaarten eerst', () => {
    expect(setsFirst(findSets(sets, '151'), '151', null)).toBe(true)
    expect(setsFirst(findSets(sets, 'evol'), 'evol', null)).toBe(true)
    expect(setsFirst(findSets(sets, 'pikachu'), 'pikachu', null)).toBe(false)
    expect(setsFirst(findSets(sets, 'mew', { lang: 'en', setId: 'sv03.5' }), 'mew', { lang: 'en', setId: 'sv03.5' })).toBe(true)
  })
})

describe('findCards', () => {
  it('namen die met de tekst beginnen eerst, hoogstens MAX_HITS', () => {
    const cards = [card('a', 'Detective Pikachu'), card('b', 'Pikachu', { set_code: 'MEW', card_number: '25' }), ...Array.from({ length: 10 }, (_, i) => card(`p${i}`, `Pikachu ${i}`))]
    const hits = findCards(cards, 'pika')
    expect(hits).toHaveLength(MAX_HITS)
    expect(hits[0].name).toBe('Pikachu')
    expect(findCards(cards, 'mew 25').map((c) => c.id)).toEqual(['b'])
    expect(findCards(cards, ' ')).toEqual([])
  })
})

describe('ownedPerSet', () => {
  it('unieke kaarten per set, zonder verkochte', () => {
    const cards = [
      card('1', 'Mew', { tcgdex_id: 'en/sv03.5-151' }),
      card('2', 'Mew', { tcgdex_id: 'en/sv03.5-151' }),
      card('3', 'Pikachu', { tcgdex_id: 'en/sv03.5-025' }),
      card('4', 'Abra', { tcgdex_id: 'en/sv03.5-063', status: 'sold' }),
    ]
    expect(ownedPerSet(cards).get('en/sv03.5')).toBe(2)
  })
})
