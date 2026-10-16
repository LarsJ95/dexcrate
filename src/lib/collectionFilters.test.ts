import { describe, expect, it } from 'vitest'
import { NO_EXTRA_FILTERS, activeFilterCount, matchesExtra, parseView, setKeyOf } from './collectionFilters'
import { EMPTY_CARD } from './types'

const mew = { ...EMPTY_CARD, name: 'Mew ex', language: 'ja' as const, variant: 'holo' as const, condition: 'NM' as const, location_id: 'red' }
const loose = { ...EMPTY_CARD, name: 'Arbok' }
const none = (): null => null

describe('extra filters', () => {
  it('taal, variant en conditie; "none" = zonder waarde', () => {
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, language: 'ja', variant: 'holo' }, none)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, language: 'en' }, none)).toBe(false)
    expect(matchesExtra(loose, { ...NO_EXTRA_FILTERS, variant: 'none' }, none)).toBe(true)
  })

  it('niet gekoppeld: alleen losse kaarten zonder catalogus-id', () => {
    const f = { ...NO_EXTRA_FILTERS, link: 'unlinked' as const }
    expect(matchesExtra(loose, f, none)).toBe(true)
    expect(matchesExtra({ ...loose, tcgdex_id: 'en/sv05-1' }, f, none)).toBe(false)
    expect(matchesExtra({ ...loose, kind: 'sealed' as const }, f, none)).toBe(false)
    expect(activeFilterCount(f)).toBe(1)
    expect(parseView(JSON.stringify({ extra: { link: 'unlinked' } }), ['list'], ['owned'], { query: '', filter: 'owned', sort: 'list', extra: NO_EXTRA_FILTERS }).extra.link).toBe('unlinked')
  })

  it('set: gekoppeld op set-id, anders op setcode', () => {
    const linked = { ...loose, tcgdex_id: 'en/sv03.5-151', set_code: 'MEW' }
    const excel = { ...loose, set_code: ' mew ' }
    expect(setKeyOf(linked)).toBe('en/sv03.5')
    expect(setKeyOf(excel)).toBe('code:MEW')
    expect(setKeyOf(loose)).toBe(null)
    const f = { ...NO_EXTRA_FILTERS, set: 'en/sv03.5' }
    expect(matchesExtra(linked, f, none)).toBe(true)
    expect(matchesExtra(excel, f, none)).toBe(false)
    expect(matchesExtra(excel, { ...NO_EXTRA_FILTERS, set: 'code:MEW' }, none)).toBe(true)
    expect(activeFilterCount(f)).toBe(1)
    expect(parseView(JSON.stringify({ extra: { set: 'en/sv03.5' } }), ['list'], ['owned'], { query: '', filter: 'owned', sort: 'list', extra: NO_EXTRA_FILTERS }).extra.set).toBe('en/sv03.5')
  })

  it('illustrator: deelnaam; tijdens laden niet wegfilteren', () => {
    const f = { ...NO_EXTRA_FILTERS, illustrator: 'aky' }
    const by = (illustrator: string) => () => ({ illustrator, rarity: null, types: [], suffix: null })
    expect(matchesExtra(mew, f, by('aky CG Works'))).toBe(true)
    expect(matchesExtra(mew, f, by('Mitsuhiro Arita'))).toBe(false)
    expect(matchesExtra(mew, f, () => undefined)).toBe(true)
    expect(matchesExtra(mew, f, () => null)).toBe(false)
    expect(activeFilterCount(f)).toBe(1)
  })
})

describe('catalogusfilters', () => {
  const info = { illustrator: null, rarity: 'Holo Rare', types: ['Psychic' as const], suffix: 'ex' }
  it('zeldzaamheid (Holo Rare = Rare Holo), type en kaarttype', () => {
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, rarity: 'Rare Holo' }, () => info)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, type: 'Psychic', suffix: 'ex' }, () => info)).toBe(true)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, suffix: 'EX' }, () => info)).toBe(false)
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, type: 'Fire' }, () => info)).toBe(false)
  })
  it('tijdens laden niet wegfilteren; zonder catalogus wel', () => {
    expect(matchesExtra(mew, { ...NO_EXTRA_FILTERS, type: 'Fire' }, () => undefined)).toBe(true)
    expect(matchesExtra(loose, { ...NO_EXTRA_FILTERS, type: 'Fire' }, none)).toBe(false)
  })
  it('onthoudt alleen bekende waarden', () => {
    const fallback = { query: '', filter: 'owned' as const, sort: 'list' as const, extra: NO_EXTRA_FILTERS }
    const v = parseView(JSON.stringify({ extra: { rarity: 'Hyper rare', type: 'Plasma', suffix: 'ex' } }), ['list'], ['owned'], fallback)
    expect(v.extra).toMatchObject({ rarity: 'Hyper rare', type: '', suffix: 'ex' })
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
