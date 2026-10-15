import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, compareTables, parseBackup, parseCsv, prepareRestore, toCsv, type Backup } from './backup'

const backup: Backup = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exported_at: '2026-10-15T20:00:00Z',
  user_id: 'old-user',
  tables: {
    cards: [
      { id: 'c1', user_id: 'old-user', name: 'Mew ex', quantity: 3, ownership: 'owned', purchase_price: 6.5, split_from: null },
      { id: 'c2', user_id: 'old-user', name: 'Mew ex', quantity: 1, ownership: 'sold', purchase_price: 6.5, split_from: 'c1' },
    ],
    card_photos: [{ id: 'p1', user_id: 'old-user', card_id: 'c1', path: 'old-user/p1.jpg', thumb_path: 'old-user/p1-thumb.jpg', original_path: null }],
    transactions: [{ id: 't1', user_id: 'old-user', kind: 'sale', amount: null, status: 'completed' }],
    transaction_lines: [{ id: 'l1', user_id: 'old-user', transaction_id: 't1', card_id: 'c2', quantity: 1, unit_amount: null }],
  },
  files: { 'card-photos/old-user/p1.jpg': 'AAAA' },
}

describe('back-up en herstel', () => {
  it('heen en terug: alles komt ongewijzigd terug (ook onbekende bedragen als null)', () => {
    const restored = parseBackup(JSON.stringify(backup))
    expect(restored).toEqual(backup)
    expect(restored.tables.transactions?.[0].amount).toBeNull()
  })

  it('weigert verkeerde of beschadigde bestanden', () => {
    expect(() => parseBackup('niet json')).toThrow('not valid JSON')
    expect(() => parseBackup(JSON.stringify({ format: 'iets anders' }))).toThrow('not a Dexcrate backup')
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('newer version')
    expect(() => parseBackup(JSON.stringify({ ...backup, tables: { cards: 'kapot' } }))).toThrow('damaged')
  })

  it('herstel in een ander account: eigen user_id en eigen opslagmap', () => {
    const { tables, files } = prepareRestore(backup, 'new-user')
    expect(tables.cards?.every((r) => r.user_id === 'new-user')).toBe(true)
    expect(tables.card_photos?.[0]).toMatchObject({ path: 'new-user/p1.jpg', thumb_path: 'new-user/p1-thumb.jpg', original_path: null })
    expect(Object.keys(files)).toEqual(['card-photos/new-user/p1.jpg'])
    // Verwijzingen tussen rijen blijven intact (ids ongewijzigd).
    expect(tables.cards?.[1].split_from).toBe('c1')
    expect(tables.transaction_lines?.[0]).toMatchObject({ transaction_id: 't1', card_id: 'c2' })
  })

  it('vergelijken met de huidige gegevens zonder te schrijven', () => {
    const current = {
      cards: [
        { id: 'c1', user_id: 'old-user', name: 'Mew ex', quantity: 2, ownership: 'owned', purchase_price: 6.5, split_from: null }, // gewijzigd
        { id: 'c9', user_id: 'old-user', name: 'Nieuw', quantity: 1 }, // alleen nu
      ],
    }
    const cards = compareTables(backup.tables, current).find((r) => r.table === 'cards')
    expect(cards).toEqual({ table: 'cards', inBackup: 2, added: 1, changed: 1, same: 0, onlyNow: 1 })
  })
})

describe('CSV', () => {
  it('schrijft en leest terug, met komma, aanhalingstekens en regeleinden in velden', () => {
    const csv = toCsv(
      [
        { name: 'Pikachu, "Surfing"', qty: 2, note: 'regel 1\nregel 2' },
        { name: 'Mew', qty: null, note: '' },
      ],
      ['name', 'qty', 'note'],
    )
    expect(parseCsv(csv)).toEqual([
      ['name', 'qty', 'note'],
      ['Pikachu, "Surfing"', '2', 'regel 1\nregel 2'],
      ['Mew', '', ''],
    ])
  })

  it('herkent puntkomma als scheidingsteken (Nederlandse Excel)', () => {
    expect(parseCsv('Naam;Aantal\r\nMew;3\r\n')).toEqual([
      ['Naam', 'Aantal'],
      ['Mew', '3'],
    ])
  })
})
