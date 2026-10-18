import { describe, expect, it } from 'vitest'
import { comparePrice } from './collectionView'
import { EMPTY_CARD, type CardInput } from './types'

type Row = CardInput & { market: number | null }
const row = (name: string, purchase_price: number | null, market: number | null): Row => ({ ...EMPTY_CARD, name, purchase_price, market })
const names = (rows: Row[], dir: 1 | -1): string[] => [...rows].sort((a, b) => comparePrice(a, b, dir, (c) => c.market)).map((c) => c.name)

describe('comparePrice', () => {
  it('geeft zonder eigen prijzen toch verschillende volgordes (marktwaarde beslist)', () => {
    const rows = [row('Indeedee', null, 0.05), row('Roaring Moon', null, 0.12), row('Koraidon', null, 0.07)]
    expect(names(rows, -1)).toEqual(['Roaring Moon', 'Koraidon', 'Indeedee'])
    expect(names(rows, 1)).toEqual(['Indeedee', 'Koraidon', 'Roaring Moon'])
  })

  it('sorteert op eigen prijs en zet kaarten zonder prijs in beide richtingen onderaan', () => {
    const rows = [row('Zonder', null, 50), row('Duur', 10, 1), row('Goedkoop', 2, 1), row('Gratis', 0, 1)]
    expect(names(rows, -1)).toEqual(['Duur', 'Goedkoop', 'Gratis', 'Zonder'])
    expect(names(rows, 1)).toEqual(['Gratis', 'Goedkoop', 'Duur', 'Zonder'])
  })

  it('zet kaarten zonder prijs én zonder marktwaarde helemaal onderaan', () => {
    const rows = [row('Niets', null, null), row('Markt', null, 0.01)]
    expect(names(rows, -1)).toEqual(['Markt', 'Niets'])
    expect(names(rows, 1)).toEqual(['Markt', 'Niets'])
  })

  it('gebruikt bij te koop de vraagprijs', () => {
    const forSale = (name: string, sale_price: number | null): Row => ({ ...row(name, 99, null), status: 'for_sale', sale_price })
    expect(names([forSale('A', 1), forSale('B', 3)], -1)).toEqual(['B', 'A'])
  })
})
