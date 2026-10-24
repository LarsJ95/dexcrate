import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, string | number | null>

/**
 * Nagebootste Supabase voor lijsten: per tabel filteren (eq), sorteren (ook nulls first/last) en hoogstens 1000 rijen
 * per verzoek, zoals de echte API (max_rows). Gelijke waarden komen per verzoek in een andere volgorde terug, zoals in
 * Postgres: zonder unieke sortering raken de pagina's in de war.
 */
const db = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    requests: [] as { table: string; order: string[] }[],
    failAt: 0,
  }
  const MAX_ROWS = 1000
  const cmp = (x: string | number, y: string | number): number => (x === y ? 0 : x < y ? -1 : 1)
  const supabase = {
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      const orders: { col: string; ascending: boolean; nullsFirst: boolean }[] = []
      const q = {
        select: () => q,
        eq: (col: string, value: string) => {
          filters.push((r) => r[col] === value)
          return q
        },
        order: (col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
          const ascending = opts.ascending ?? true
          // Postgres: oplopend → null achteraan, aflopend → null vooraan, tenzij anders gevraagd.
          orders.push({ col, ascending, nullsFirst: opts.nullsFirst ?? !ascending })
          return q
        },
        range: (from: number, to: number) => {
          state.requests.push({ table, order: orders.map((o) => `${o.col}.${o.ascending ? 'asc' : 'desc'}${o.nullsFirst === !o.ascending ? '' : o.nullsFirst ? '.nullsfirst' : '.nullslast'}`) })
          if (state.requests.length === state.failAt) return Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } })
          const all = state.tables[table] ?? []
          const input = state.requests.length % 2 ? [...all].reverse() : all
          const sorted = input
            .filter((r) => filters.every((f) => f(r)))
            .sort((a, b) => {
              for (const { col, ascending, nullsFirst } of orders) {
                const x = a[col] ?? null
                const y = b[col] ?? null
                if (x === y) continue
                if (x === null) return nullsFirst ? -1 : 1
                if (y === null) return nullsFirst ? 1 : -1
                return ascending ? cmp(x, y) : -cmp(x, y)
              }
              return 0
            })
          return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
        },
      }
      return q
    },
  }
  return { state, supabase }
})
vi.mock('./supabase', () => ({ supabase: db.supabase }))

const { listCrateCards } = await import('./crate')
const { listWishlist } = await import('./wishlist')
const { listListMembers } = await import('./wishlistLists')
const { listTransactions } = await import('./transactions')
const { listValuations } = await import('./valuationDb')

const N = 2500
const pad = (i: number): string => String(i).padStart(5, '0')
const tables = (): string[] => db.state.requests.map((r) => r.table)

beforeEach(() => {
  db.state.tables = {}
  db.state.requests = []
  db.state.failAt = 0
})

describe('lijsten boven de 1000 rijen: alles, precies één keer', () => {
  it('Crate-kaarten (een pakje heeft overal dezelfde tijd)', async () => {
    db.state.tables.crate_cards = Array.from({ length: N }, (_, i) => ({
      id: `id-${pad(i)}`,
      tcgdex_id: `en/x-${pad(i)}`,
      name: `Card ${i}`,
      quantity: 1,
      // Groepjes van 7 met dezelfde tijd, zodat er ook een groepje over de grens van 1000 heen loopt.
      last_at: new Date(Date.UTC(2026, 9, 1, 0, Math.floor(i / 7))).toISOString(),
    }))
    const cards = await listCrateCards()
    expect(cards).toHaveLength(N)
    expect(new Set(cards.map((c) => c.tcgdexId)).size).toBe(N)
    // Nieuwste pakje eerst.
    expect(cards[0].tcgdexId).toMatch(/^en\/x-0249\d$/)
    expect(tables()).toEqual(['crate_cards', 'crate_cards', 'crate_cards'])
    expect(db.state.requests[0].order).toEqual(['last_at.desc', 'id.asc'])
  })

  it('wishlist (een hele set in één keer toegevoegd: zelfde prioriteit en tijd)', async () => {
    db.state.tables.wishlist_items = Array.from({ length: N }, (_, i) => ({ id: `w-${pad(i)}`, name: `Card ${i}`, priority: 2, created_at: '2026-10-24T10:00:00.000Z' }))
    const items = await listWishlist()
    expect(items).toHaveLength(N)
    expect(new Set(items.map((w) => w.id)).size).toBe(N)
    expect(db.state.requests[0].order).toEqual(['priority.asc', 'created_at.desc', 'id.asc'])
  })

  it('eigen lijsten: alle koppelingen', async () => {
    db.state.tables.wishlist_list_items = Array.from({ length: N }, (_, i) => ({ list_id: `l${i % 3}`, item_id: `w-${pad(i)}` }))
    const members = await listListMembers()
    expect([...members.values()].reduce((n, s) => n + s.size, 0)).toBe(N)
    expect(members.get('l0')?.size).toBe(834)
    expect(db.state.requests[0].order).toEqual(['list_id.asc', 'item_id.asc'])
  })

  it('transacties (omgezette historie: zelfde tijd, deels zonder datum)', async () => {
    db.state.tables.transactions = Array.from({ length: N }, (_, i) => ({
      id: `t-${pad(i)}`,
      kind: i % 2 ? 'sale' : 'purchase',
      occurred_on: i % 5 === 0 ? null : '2026-10-01',
      created_at: '2026-10-16T09:00:00.000Z',
    }))
    const txs = await listTransactions()
    expect(txs).toHaveLength(N)
    expect(new Set(txs.map((t) => t.id)).size).toBe(N)
    // Zonder datum achteraan, zoals voorheen.
    expect(txs.at(-1)?.occurred_on).toBeNull()
    expect(txs[0].occurred_on).toBe('2026-10-01')
    expect(db.state.requests[0].order).toEqual(['occurred_on.desc.nullslast', 'created_at.desc', 'id.asc'])
  })

  it('waarderingen: alles, of alleen die van één kaartregel (filter op elke pagina)', async () => {
    db.state.tables.valuations = Array.from({ length: N }, (_, i) => ({
      id: `v-${pad(i)}`,
      card_id: i % 2 ? 'c1' : 'c2',
      amount: 1,
      valued_on: '2026-10-01',
      created_at: '2026-10-01T10:00:00.000Z',
    }))
    const all = await listValuations()
    expect(all).toHaveLength(N)
    expect(new Set(all.map((v) => v.id)).size).toBe(N)
    db.state.requests = []
    const one = await listValuations('c1')
    expect(one).toHaveLength(1250)
    expect(one.every((v) => v.card_id === 'c1')).toBe(true)
    expect(db.state.requests).toHaveLength(2)
    expect(db.state.requests[0].order).toEqual(['valued_on.desc', 'created_at.desc', 'id.asc'])
  })

  it('twee gelijktijdige aanroepen (pagina + menutellers) delen één reeks verzoeken, elk een eigen lijst', async () => {
    db.state.tables.wishlist_items = Array.from({ length: N }, (_, i) => ({ id: `w-${pad(i)}`, name: `Card ${i}`, priority: 2, created_at: '2026-10-24T10:00:00.000Z' }))
    const [a, b] = await Promise.all([listWishlist(), listWishlist()])
    expect(db.state.requests).toHaveLength(3)
    expect(a).toHaveLength(N)
    expect(a).not.toBe(b)
    expect(b).toEqual(a)
    // Daarna weer een nieuw verzoek (geen verouderde cache).
    await listWishlist()
    expect(db.state.requests).toHaveLength(6)
  })

  it('fout op een latere pagina: melding met de oorzaak (herkenbaar als netwerkfout), geen halve lijst', async () => {
    db.state.tables.wishlist_items = Array.from({ length: N }, (_, i) => ({ id: `w-${pad(i)}`, name: `Card ${i}`, priority: 2, created_at: '2026-10-24T10:00:00.000Z' }))
    db.state.failAt = 2
    await expect(listWishlist()).rejects.toThrow('Loading the wishlist failed: TypeError: Failed to fetch')
  })
})
