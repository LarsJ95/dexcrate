import { describe, expect, it } from 'vitest'
import { NO_EXTRA_FILTERS, activeFilterCount, matchesExtra, parseView } from './collectionFilters'
import { EMPTY_CARD } from './types'

const mew = { ...EMPTY_CARD, name: 'Mew ex', language: 'ja' as const, variant: 'holo' as const, condition: 'NM' as const, location_id: 'red' }
const loose = { ...EMPTY_CARD, name: 'Arbok' }
const none = (): null => null

describe('extra filters', () => {
  it('taal, variant, conditie en locatie; "none" = zonder waarde', () => {
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, language: 'ja', variant: 'holo' }, none)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, language: 'en' }, none)).toBe(false)
    expect(matchesExtra(loose, { ...NO_EXTRA_FILTERS, variant: 'none' }, none)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, location: 'red' }, none)).toBe(true)
    expect(matchesExtra(loose, { ...NO_EXTRA_FILTERS, location: 'none' }, none)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, location: 'none' }, none)).toBe(false)
  })

  it('illustrator: deelnaam; tijdens laden niet wegfilteren', () => {
    const f = { ...NO_EXTRA_FILTERS, illustrator: 'aky' }
    expect(matchesExtra(mew, f, () => 'aky CG Works')).toBe(true)
    expect(matchesExtra(mew, f, () => 'Mitsuhiro Arita')).toBe(false)
    expect(matchesExtra(mew, f, () => undefined)).toBe(true)
    expect(matchesExtra(mew, f, () => null)).toBe(false)
    expect(activeFilterCount(f)).toBe(1)
  })
})

describe('onthouden weergave', () => {
  const fallback = { query: '', filter: 'owned' as const, sort: 'list' as const, extra: NO_EXTRA_FILTERS }
  it('leest een opgeslagen weergave; rommel valt terug op de standaard', () => {
    const saved = JSON.stringify({ query: 'mew', filter: 'sold', sort: 'name', extra: { language: 'ja', illustrator: 'aky' } })
    expect(parseView(saved, ['list', 'name'], ['owned', 'sold'], fallback)).toEqual({
      query: 'mew',
      filter: 'sold',
      sort: 'name',
      extra: { ...NO_EXTRA_FILTERS, language: 'ja', illustrator: 'aky' },
    })
    expect(parseView('{kapot', ['list'], ['owned'], fallback)).toEqual(fallback)
    expect(parseView(JSON.stringify({ filter: 'hacked', sort: 'x' }), ['list'], ['owned'], fallback)).toMatchObject({ filter: 'owned', sort: 'list' })
  })
})

describe('onthouden weergave: ongeldige filterwaarden', () => {
  it('worden genegeerd in plaats van alles weg te filteren', () => {
    const fallback = { query: '', filter: 'owned' as const, sort: 'list' as const, extra: NO_EXTRA_FILTERS }
    const v = parseView(JSON.stringify({ extra: { language: 'klingon', variant: 'none', condition: 'NM' } }), ['list'], ['owned'], fallback)
    expect(v.extra).toMatchObject({ language: '', variant: 'none', condition: 'NM' })
  })
})
