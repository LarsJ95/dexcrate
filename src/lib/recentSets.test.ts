import { describe, expect, it } from 'vitest'
import { addRecentSet, parseRecentSets, recentSetHref } from './recentSets'

const s = (setId: string, name = setId) => ({ lang: 'en', setId, name })

describe('recente sets', () => {
  it('nieuwste vooraan, zonder dubbele, hooguit drie', () => {
    let list = addRecentSet([], s('sv01'))
    list = addRecentSet(list, s('sv02'))
    list = addRecentSet(list, s('sv01'))
    expect(list.map((x) => x.setId)).toEqual(['sv01', 'sv02'])
    list = addRecentSet(addRecentSet(list, s('sv03')), s('sv04'))
    expect(list.map((x) => x.setId)).toEqual(['sv04', 'sv03', 'sv01'])
  })

  it('zelfde set in een andere taal telt apart', () => {
    expect(addRecentSet([s('sv01')], { lang: 'ja', setId: 'sv01', name: 'SV1' })).toHaveLength(2)
  })

  it('kapotte opslag: geen recente sets', () => {
    expect(parseRecentSets(null)).toEqual([])
    expect(parseRecentSets('{kapot')).toEqual([])
    expect(parseRecentSets(JSON.stringify([s('a'), { lang: 'en' }, 3, s('b')]))).toEqual([s('a'), s('b')])
  })

  it('link naar de set, met veilige set-id', () => {
    expect(recentSetHref({ lang: 'en', setId: 'sv03.5', name: '151' })).toBe('#/sets/en/sv03.5')
    expect(recentSetHref({ lang: 'en', setId: 'a/b', name: 'x' })).toBe('#/sets/en/a%2Fb')
  })
})
