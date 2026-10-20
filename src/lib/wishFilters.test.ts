import { describe, expect, it } from 'vitest'
import { NO_WISH_FILTERS, activeWishFilterCount, clearWishChip, matchesWishFilters, parseWishFilters, sameWishFilters, wishFilterChips, type WishRow } from './wishFilters'

const item: WishRow = { name: 'Pikachu ex', variant: 'holo', language: 'en', set_code: 'SCR', priority: 1, max_price: 10, tcgdex_id: 'en/sv07-148' }
const ctx = { found: false, market: 7.5, info: { illustrator: null, rarity: 'Illustration rare', types: ['Water' as const], suffix: null } }

describe('wishlist-filters', () => {
  it('prijs: vanaf, tot en met, binnen je max; laden filtert niet weg, geen prijs wel', () => {
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, maxPrice: 10 }, ctx)).toBe(true)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, maxPrice: 5 }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, minPrice: 8 }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, underMax: true }, ctx)).toBe(true)
    expect(matchesWishFilters({ ...item, max_price: null }, { ...NO_WISH_FILTERS, underMax: true }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, maxPrice: 5 }, { ...ctx, market: undefined })).toBe(true)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, maxPrice: 5 }, { ...ctx, market: null })).toBe(false)
  })

  it('prioriteit, set, type en gevonden', () => {
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, priority: 2 }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, set: ' scr ' }, ctx)).toBe(true)
    // Nieuwe set-kiezer: op catalogus-set-id.
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, set: 'sv07' }, ctx)).toBe(true)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, set: 'sv03.5' }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, type: 'Fire' }, ctx)).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, type: 'Water' }, ctx)).toBe(true)
    expect(matchesWishFilters({ ...item, tcgdex_id: null }, { ...NO_WISH_FILTERS, type: 'Water' }, ctx)).toBe(false)
    expect(matchesWishFilters(item, NO_WISH_FILTERS, { ...ctx, found: true })).toBe(false)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, showFound: true }, { ...ctx, found: true })).toBe(true)
  })

  it('naam bevat (hoofdletterongevoelig, elk woord)', () => {
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, name: 'pikachu' }, ctx)).toBe(true)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, name: ' PIKA ex ' }, ctx)).toBe(true)
    expect(matchesWishFilters(item, { ...NO_WISH_FILTERS, name: 'raichu' }, ctx)).toBe(false)
    expect(activeWishFilterCount({ ...NO_WISH_FILTERS, name: 'pikachu' })).toBe(1)
    expect(activeWishFilterCount({ ...NO_WISH_FILTERS, name: '  ' })).toBe(0)
    expect(parseWishFilters({ name: ` ${'x'.repeat(60)}` }).name).toHaveLength(40)
  })

  it('inlezen uit de database: rommel valt terug op geen filter', () => {
    expect(parseWishFilters({ maxPrice: 10, type: 'Fire', priority: 1, hacked: 'x' })).toEqual({ ...NO_WISH_FILTERS, maxPrice: 10, type: 'Fire', priority: 1 })
    expect(parseWishFilters({ maxPrice: -1, type: 'Lava', priority: 9, rarity: 'Mythic', variant: 'gold' })).toEqual(NO_WISH_FILTERS)
    expect(parseWishFilters('kapot')).toEqual(NO_WISH_FILTERS)
    expect(activeWishFilterCount({ ...NO_WISH_FILTERS, maxPrice: 10, showFound: true })).toBe(1)
    expect(sameWishFilters({ ...NO_WISH_FILTERS, set: 'SCR' }, { ...NO_WISH_FILTERS, set: 'SCR ' })).toBe(true)
  })
})

describe('wishFilterChips', () => {
  it('prijsbereik als één chip, die beide grenzen wist', () => {
    const chips = wishFilterChips({ ...NO_WISH_FILTERS, minPrice: 5, maxPrice: 20, priority: 1, showFound: true })
    expect(chips.map((c) => c.key)).toEqual(['priority', 'price', 'showFound'])
    expect(chips[0].label).toBe('Priority: High')
    expect(chips[1].label).toMatch(/5.*20/)
    expect(clearWishChip('price')).toEqual({ minPrice: null, maxPrice: null })
    expect(clearWishChip('priority')).toEqual({ priority: null })
    expect(wishFilterChips({ ...NO_WISH_FILTERS, maxPrice: 3 })[0].label).toMatch(/^Up to /)
  })
})
