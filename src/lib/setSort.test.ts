import { describe, expect, it } from 'vitest'
import { sortSetCards, type SortData } from './setSort'

const cards = [
  { id: 's-1', name: 'Pikachu' },
  { id: 's-2', name: 'Bulbasaur' },
  { id: 's-3', name: 'Charizard' },
  { id: 's-4', name: 'Abra' },
]
const data: SortData = {
  complete: (id) => id === 's-2' || id === 's-4',
  value: new Map([
    ['s-1', 1.5],
    ['s-2', null],
    ['s-3', 40],
  ]),
  rank: new Map([
    ['s-1', 1],
    ['s-3', 9],
    ['s-4', 1],
  ]),
}
const ids = (list: { id: string }[]): string[] => list.map((c) => c.id)

describe('sorteren binnen een set', () => {
  it('nummer = setvolgorde', () => {
    expect(ids(sortSetCards(cards, 'number', data))).toEqual(['s-1', 's-2', 's-3', 's-4'])
  })
  it('waarde en zeldzaamheid aflopend, onbekend achteraan, gelijk in setvolgorde', () => {
    expect(ids(sortSetCards(cards, 'value', data))).toEqual(['s-3', 's-1', 's-2', 's-4'])
    expect(ids(sortSetCards(cards, 'rarity', data))).toEqual(['s-3', 's-1', 's-4', 's-2'])
  })
  it('naam, in bezit eerst, ontbrekend eerst', () => {
    expect(ids(sortSetCards(cards, 'name', data))).toEqual(['s-4', 's-2', 's-3', 's-1'])
    expect(ids(sortSetCards(cards, 'owned', data))).toEqual(['s-2', 's-4', 's-1', 's-3'])
    expect(ids(sortSetCards(cards, 'missing', data))).toEqual(['s-1', 's-3', 's-2', 's-4'])
  })
})
