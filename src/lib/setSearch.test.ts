import { describe, expect, it } from 'vitest'
import { looksLikeAbbr, suggestSets, type SetCandidate } from './setSearch'

const set = (setId: string, name: string, order: number, owned = 0): SetCandidate => ({ setId, name, order, owned })
const SETS = [
  set('base1', 'Base Set', 1),
  set('swsh7', 'Evolving Skies', 50, 2),
  set('sv03.5', '151', 80),
  set('sv04.5', 'Paldean Fates', 85),
  set('sv02', 'Paldea Evolved', 75),
  set('mcd15', "McDonald's Collection 2015", 40),
  set('sv08', 'Surging Sparks', 90),
]
const ids = (q: string, exact: string | null = null): string[] => suggestSets(SETS, q, 6, exact).map((s) => s.setId)

describe('suggestSets', () => {
  it('"15" stelt eerst 151 voor', () => {
    expect(ids('15')[0]).toBe('sv03.5')
    expect(ids('15')).toContain('mcd15')
  })

  it('begin van een woord gaat voor ergens in de naam', () => {
    expect(ids('evol')).toEqual(['swsh7', 'sv02'])
    expect(ids('skies')).toEqual(['swsh7'])
  })

  it('bij gelijke score: in bezit eerst, dan nieuwer', () => {
    expect(ids('pald')).toEqual(['sv04.5', 'sv02'])
    // Naam begint met "s" gaat voor een woord dat met "s" begint; daarbinnen in bezit eerst.
    expect(ids('s').slice(0, 2)).toEqual(['sv08', 'swsh7'])
  })

  it('set-id en afkorting-treffer', () => {
    expect(ids('sv08')).toEqual(['sv08'])
    expect(ids('mew', 'sv03.5')).toEqual(['sv03.5'])
  })

  it('leeg of geen treffer', () => {
    expect(ids('  ')).toEqual([])
    expect(ids('zzz')).toEqual([])
  })

  it('afkorting herkennen', () => {
    expect(looksLikeAbbr('MEW')).toBe(true)
    expect(looksLikeAbbr('sv8')).toBe(true)
    expect(looksLikeAbbr('paldea')).toBe(false)
    expect(looksLikeAbbr('m')).toBe(false)
  })
})
