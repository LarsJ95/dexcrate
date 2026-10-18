import { describe, expect, it, vi } from 'vitest'
import type { CrateCard } from './crate'

// crate.ts laadt de Supabase-client; in CI zijn daar geen sleutels voor.
vi.mock('./supabase', () => ({ supabase: {} }))
const { NO_CRATE_FILTERS, crateFilterCount, crateSetOptions, matchesCrate, matchesCrateSearch, sortCrate } = await import('./crateFilters')

const card = (tcgdexId: string, name: string, rarity: string | null, quantity = 1, setName: string | null = 'Set'): CrateCard => ({
  tcgdexId,
  name,
  image: null,
  rarity,
  setName,
  quantity,
  firstAt: '',
})

const pika = card('en/sv03.5-025', 'Pikachu', 'Common', 3, '151')
const zard = card('en/sv03.5-199', 'Charizard ex', 'Special illustration rare', 1, '151')
const mew = card('en/sv04.5-232', 'Mew ex', 'Hyper rare', 2, 'Paldean Fates')

describe('Crate-filters', () => {
  it('telt actieve filters', () => {
    expect(crateFilterCount(NO_CRATE_FILTERS)).toBe(0)
    expect(crateFilterCount({ ...NO_CRATE_FILTERS, set: 'en/sv03.5', duplicates: true })).toBe(2)
  })

  it('zoeken op naam of set', () => {
    expect(matchesCrateSearch(pika, 'pika')).toBe(true)
    expect(matchesCrateSearch(mew, 'paldean')).toBe(true)
    expect(matchesCrateSearch(zard, 'mew')).toBe(false)
  })

  it('set, zeldzaamheid en dubbelen zonder catalogus', () => {
    expect(matchesCrate(pika, { ...NO_CRATE_FILTERS, set: 'en/sv03.5' }, undefined)).toBe(true)
    expect(matchesCrate(mew, { ...NO_CRATE_FILTERS, set: 'en/sv03.5' }, undefined)).toBe(false)
    expect(matchesCrate(zard, { ...NO_CRATE_FILTERS, rarity: 'Special illustration rare' }, undefined)).toBe(true)
    expect(matchesCrate(zard, { ...NO_CRATE_FILTERS, duplicates: true }, undefined)).toBe(false)
  })

  it('type en illustrator uit de catalogus; laden = niet wegfilteren', () => {
    const f = { ...NO_CRATE_FILTERS, type: 'Fire' as const }
    expect(matchesCrate(zard, f, undefined)).toBe(true)
    expect(matchesCrate(zard, f, { types: ['Fire'], rarity: null, suffix: 'ex', illustrator: 'Arita' })).toBe(true)
    expect(matchesCrate(pika, f, { types: ['Lightning'], rarity: null, suffix: null, illustrator: null })).toBe(false)
    expect(matchesCrate(zard, { ...NO_CRATE_FILTERS, illustrator: 'arit' }, { types: ['Fire'], rarity: null, suffix: 'ex', illustrator: 'Mitsuhiro Arita' })).toBe(true)
    expect(matchesCrate(zard, { ...NO_CRATE_FILTERS, type: 'Fire' }, null)).toBe(false)
  })

  it('sorteren', () => {
    expect(sortCrate([pika, zard, mew], 'rarity').map((c) => c.name)).toEqual(['Mew ex', 'Charizard ex', 'Pikachu'])
    expect(sortCrate([zard, mew, pika], 'copies').map((c) => c.name)).toEqual(['Pikachu', 'Mew ex', 'Charizard ex'])
    expect(sortCrate([zard, mew, pika], 'set').map((c) => c.name)).toEqual(['Pikachu', 'Charizard ex', 'Mew ex'])
  })

  it('setkeuzes op naam', () => {
    expect(crateSetOptions([mew, zard, pika])).toEqual([
      { key: 'en/sv03.5', label: '151' },
      { key: 'en/sv04.5', label: 'Paldean Fates' },
    ])
  })
})
