import { describe, expect, it } from 'vitest'
import { findDuplicates, guessMapping, parseDate, rowsToDrafts } from './csvImport'
import { EMPTY_CARD } from './types'

describe('guessMapping', () => {
  it('herkent Engelse en Nederlandse kolomnamen', () => {
    expect(guessMapping(['Naam', 'Set', 'Nummer', 'Aantal', 'Taal', 'Prijs', 'Opmerking'])).toEqual({
      name: 0,
      set_code: 1,
      card_number: 2,
      quantity: 3,
      language: 4,
      purchase_price: 5,
      notes: 6,
    })
    expect(guessMapping(['Card name', 'Qty', 'Condition', 'Unknown column'])).toEqual({ name: 0, quantity: 1, condition: 2 })
  })
})

describe('parseDate', () => {
  it('leest gangbare notaties en weigert onzin', () => {
    expect(parseDate('2026-10-15')).toBe('2026-10-15')
    expect(parseDate('15-10-2026')).toBe('2026-10-15')
    expect(parseDate('5/3/2026')).toBe('2026-03-05')
    expect(parseDate('31-02-2026')).toBeNull()
    expect(parseDate('gisteren')).toBeNull()
  })
})

describe('rowsToDrafts', () => {
  const mapping = guessMapping(['Name', 'Set', 'Number', 'Qty', 'Language', 'Variant', 'Condition', 'Price'])

  it('zet waarden om; onbekende waarden worden gemeld, niet verzonnen', () => {
    const [ok, odd, empty] = rowsToDrafts(
      [
        ['Mew ex', 'MEW', '#151', '3x', 'Japanese', 'Reverse Holo', 'Near Mint', '€ 4,95'],
        ['Pikachu', '', '', 'veel', 'Klingon', 'shiny', 'ok', 'gratis'],
        ['', 'MEW', '1', '1', '', '', '', ''],
      ],
      mapping,
    )
    expect(ok.input).toMatchObject({ name: 'Mew ex', set_code: 'MEW', card_number: '151', quantity: 3, language: 'ja', variant: 'reverse', condition: 'NM', purchase_price: 4.95 })
    expect(ok.problems).toEqual([])
    expect(odd.input).toMatchObject({ quantity: 1, language: null, variant: null, condition: null, purchase_price: null })
    expect(odd.problems).toHaveLength(5)
    // Zonder naam niet importeerbaar, maar wel zichtbaar (niet stil overgeslagen).
    expect(empty.invalid).toBe(true)
    expect(empty.line).toBe(3)
  })
})

describe('findDuplicates', () => {
  it('meldt dezelfde uitvoering in je collectie of eerder in het bestand', () => {
    const drafts = rowsToDrafts(
      [
        ['Mew ex', 'MEW', '151', '1', 'English', 'Holo'],
        ['Mew ex', 'MEW', '151', '1', 'English', 'Holo'],
        ['Mew ex', 'MEW', '151', '1', 'English', 'Reverse holo'],
        ['Arbok', 'TEF', '176', '1', 'English', 'Holo'],
      ],
      guessMapping(['Name', 'Set', 'Number', 'Qty', 'Language', 'Variant']),
    )
    const existing = [{ ...EMPTY_CARD, name: 'Arbok', set_code: 'TEF', card_number: '176', language: 'en' as const, variant: 'holo' as const }]
    const dup = findDuplicates(drafts, existing)
    expect([...dup.entries()]).toEqual([
      [2, 'file'],
      [4, 'collection'],
    ])
  })
})
