import { describe, expect, it } from 'vitest'
import { parsePrintRows, samePrint } from './prints'

const voltorb = { name: 'Voltorb', illustrator: 'Keiji Kinebuchi', hp: 40, attacks: ['Tackle'] }

describe('andere prints', () => {
  it('herdruk: zelfde naam, illustrator, HP en aanvallen', () => {
    expect(samePrint(voltorb, { ...voltorb, illustrator: 'keiji kinebuchi' })).toBe(true)
    expect(samePrint(voltorb, { ...voltorb, attacks: ['Swift'] })).toBe(false)
    expect(samePrint(voltorb, { ...voltorb, hp: 50 })).toBe(false)
    expect(samePrint(voltorb, { ...voltorb, illustrator: 'Ken Sugimori' })).toBe(false)
  })

  it('zonder illustrator geen uitspraak', () => {
    expect(samePrint({ ...voltorb, illustrator: null }, { ...voltorb, illustrator: null })).toBe(false)
  })

  it('leest het antwoord van TCGdex; kapotte regels vallen weg', () => {
    const rows = parsePrintRows([
      { id: 'lc-97', localId: '97', name: 'Voltorb', image: 'https://x/lc/97', illustrator: 'Keiji Kinebuchi', hp: 40, attacks: [{ name: 'Tackle' }], set: { id: 'lc', name: 'Legendary Collection' } },
      { id: 'x', name: 'Geen set' },
      null,
    ])
    expect(rows).toEqual([
      { id: 'lc-97', localId: '97', name: 'Voltorb', image: 'https://x/lc/97', illustrator: 'Keiji Kinebuchi', hp: 40, attacks: ['Tackle'], setId: 'lc', setName: 'Legendary Collection' },
    ])
  })
})
