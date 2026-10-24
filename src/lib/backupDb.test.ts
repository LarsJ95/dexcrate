import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, string | number | null>

/**
 * Nagebootste Supabase voor de back-up: hoogstens 1000 rijen per verzoek (max_rows). Zonder sortering komen de rijen
 * per verzoek in een andere volgorde terug, zoals Postgres dat mag: dan raken de blokken in de war.
 */
const db = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    errors: {} as Record<string, { code: string; message: string }>,
    orders: {} as Record<string, string[]>,
    requests: 0,
  }
  const supabase = {
    from: (table: string) => {
      const orders: string[] = []
      const q = {
        select: () => q,
        order: (col: string) => {
          orders.push(col)
          return q
        },
        range: (from: number, to: number) => {
          state.requests += 1
          state.orders[table] = orders
          const error = state.errors[table]
          if (error) return Promise.resolve({ data: null, error })
          const all = state.tables[table] ?? []
          const rows = state.requests % 2 ? [...all].reverse() : [...all]
          for (const col of [...orders].reverse()) rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0))
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
        },
      }
      return q
    },
  }
  return { state, supabase }
})
vi.mock('./supabase', () => ({ supabase: db.supabase }))

const { fetchAllTables } = await import('./backupDb')
const { BACKUP_TABLES } = await import('./backup')

const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" }

beforeEach(() => {
  db.state.tables = {}
  db.state.errors = {}
  db.state.orders = {}
  db.state.requests = 0
})

describe('fetchAllTables', () => {
  it('meer dan 1000 rijen: alles precies één keer, op de primaire sleutel gesorteerd', async () => {
    db.state.tables.cards = Array.from({ length: 2500 }, (_, i) => ({ id: `c-${String(i).padStart(5, '0')}`, name: `Card ${i}` }))
    db.state.tables.user_settings = [{ user_id: 'u1', settings: '{}' }]
    const tables = await fetchAllTables()
    expect(tables.cards).toHaveLength(2500)
    expect(new Set(tables.cards?.map((r) => r.id)).size).toBe(2500)
    expect(tables.user_settings).toEqual([{ user_id: 'u1', settings: '{}' }])
    expect(db.state.orders.cards).toEqual(['id'])
    expect(db.state.orders.user_settings).toEqual(['user_id'])
    // Elke tabel staat erin, ook lege.
    expect(Object.keys(tables).sort()).toEqual([...BACKUP_TABLES].sort())
  })

  it('tabel bestaat niet (SQL-stap niet gedraaid): overgeslagen', async () => {
    db.state.errors.scan_sessions = MISSING
    const tables = await fetchAllTables()
    expect(tables.scan_sessions).toBeUndefined()
    expect(tables.cards).toEqual([])
  })

  it('tijdelijke storing (PGRST002 "schema cache"): fout, niet stil een tabel minder', async () => {
    db.state.errors.wishlist_items = { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' }
    await expect(fetchAllTables()).rejects.toThrow('Reading wishlist_items failed: Could not query the database for the schema cache')
  })
})

describe('fetchExportOnly (AVG, 24-10-2026): ook lijsten, Pack game, scan-keuzes en foutmeldingen in het bestand', () => {
  it('alle tabellen, met een vaste volgorde (ook op twee kolommen); ontbrekende tabel overgeslagen', async () => {
    const { fetchExportOnly } = await import('./backupDb')
    db.state.tables.wishlist_list_items = Array.from({ length: 1500 }, (_, i) => ({ list_id: `l-${i % 3}`, item_id: `w-${String(i).padStart(5, '0')}` }))
    db.state.tables.crate_wallet = [{ user_id: 'u1', points: 640 }]
    db.state.errors.app_errors = MISSING
    const extra = await fetchExportOnly()
    expect(extra.wishlist_list_items).toHaveLength(1500)
    expect(new Set(extra.wishlist_list_items?.map((r) => `${r.list_id}|${r.item_id}`)).size).toBe(1500)
    expect(db.state.orders.wishlist_list_items).toEqual(['list_id', 'item_id'])
    expect(extra.crate_wallet).toEqual([{ user_id: 'u1', points: 640 }])
    expect(extra.app_errors).toBeUndefined()
    expect(Object.keys(extra).sort()).toEqual(['crate_cards', 'crate_ledger', 'crate_wallet', 'scan_choices', 'wishlist_list_items', 'wishlist_lists'])
  })
})
