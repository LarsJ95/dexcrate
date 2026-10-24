import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, string | number | null>

/**
 * Nagebootste Supabase (price_snapshots en cards): filtert, sorteert en geeft hoogstens 1000 rijen per verzoek, zoals de
 * echte API (max_rows). Gelijke waarden komen per verzoek in een andere volgorde terug, zoals in Postgres: zonder
 * unieke sortering raken de pagina's dan in de war.
 */
const db = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    cards: [] as Row[],
    requests: 0,
    orders: [] as string[][],
    error: null as { message: string } | null,
  }
  const MAX_ROWS = 1000
  const cmp = (x: string | number | null, y: string | number | null): number => (x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1)
  const supabase = {
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      const orders: { col: string; ascending: boolean }[] = []
      const respond = (from: number, to: number) => {
        state.requests += 1
        state.orders.push(orders.map((o) => `${o.col}.${o.ascending ? 'asc' : 'desc'}`))
        if (state.error) return Promise.resolve({ data: null, error: state.error })
        const all = table === 'cards' ? state.cards : state.rows
        const input = state.requests % 2 ? [...all].reverse() : all
        const sorted = input
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => {
            for (const { col, ascending } of orders) {
              const c = cmp(a[col] ?? null, b[col] ?? null)
              if (c !== 0) return ascending ? c : -c
            }
            return 0
          })
        return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
      }
      const q = {
        select: () => q,
        in: (col: string, values: string[]) => {
          filters.push((r) => values.includes(String(r[col])))
          return q
        },
        eq: (col: string, value: string) => {
          filters.push((r) => r[col] === value)
          return q
        },
        order: (col: string, opts: { ascending?: boolean } = {}) => {
          orders.push({ col, ascending: opts.ascending ?? true })
          return q
        },
        range: (from: number, to: number) => respond(from, to),
        limit: (n: number) => respond(0, n - 1),
      }
      return q
    },
  }
  return { state, supabase }
})
vi.mock('./supabase', () => ({ supabase: db.supabase }))

const { listCards, listSnapshotsFor } = await import('./db')

const day = (d: number): string => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)
const history = (id: string, days: number): Row[] =>
  Array.from({ length: days }, (_, d) => ({ tcgdex_id: id, taken_on: day(d), trend: d, trend_holo: null }))

beforeEach(() => {
  db.state.rows = []
  db.state.cards = []
  db.state.requests = 0
  db.state.orders = []
  db.state.error = null
})

describe('listCards', () => {
  it('meer dan 1000 regels, ook met gelijke sortering (CSV-import): alles precies één keer', async () => {
    // 2000 regels uit één import: zelfde sort_order en created_at; daarna 500 losse.
    db.state.cards = Array.from({ length: 2500 }, (_, i) => ({
      id: `c-${String(i).padStart(5, '0')}`,
      name: `Card ${i}`,
      quantity: 1,
      sort_order: i < 2000 ? 0 : i,
      created_at: i < 2000 ? '2026-10-24T10:00:00.000Z' : new Date(Date.UTC(2026, 9, 24, 11, 0, i)).toISOString(),
    }))
    const cards = await listCards()
    expect(cards).toHaveLength(2500)
    expect(new Set(cards.map((c) => c.id)).size).toBe(2500)
    expect(cards.at(-1)?.id).toBe('c-02499')
    // Schemacontrole (1 verzoek) + 3 pagina's, elke pagina met id als laatste sortering.
    expect(db.state.requests).toBe(4)
    expect(db.state.orders.slice(1)).toEqual(Array.from({ length: 3 }, () => ['sort_order.asc', 'created_at.asc', 'id.asc']))
  })
})

describe('listSnapshotsFor', () => {
  it('meer dan 1000 opnames: alles komt binnen, ook de nieuwste dag', async () => {
    db.state.rows = [...history('en/a-1', 600), ...history('en/a-2', 600)]
    const rows = await listSnapshotsFor(['en/a-1', 'en/a-2'])
    expect(rows).toHaveLength(1200)
    expect(new Set(rows.map((r) => `${r.tcgdexId}|${r.takenOn}`)).size).toBe(1200)
    expect(rows.filter((r) => r.takenOn === day(599)).map((r) => r.tcgdexId).sort()).toEqual(['en/a-1', 'en/a-2'])
    expect(db.state.requests).toBe(2)
  })

  it('precies 1000 opnames: één extra verzoek om zeker te zijn, geen dubbele rijen', async () => {
    db.state.rows = [...history('en/a-1', 500), ...history('en/a-2', 500)]
    const rows = await listSnapshotsFor(['en/a-1', 'en/a-2'])
    expect(rows).toHaveLength(1000)
    expect(db.state.requests).toBe(2)
  })

  it('veel kaarten: per blok van 80 apart in pagina’s', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `en/b-${i}`)
    db.state.rows = ids.flatMap((id) => history(id, 15))
    const rows = await listSnapshotsFor(ids)
    expect(rows).toHaveLength(1500)
    // Blok 1: 80 × 15 = 1200 rijen (2 pagina's); blok 2: 20 × 15 = 300 rijen (1 pagina).
    expect(db.state.requests).toBe(3)
  })

  it('geen kaarten: geen verzoek', async () => {
    expect(await listSnapshotsFor([])).toEqual([])
    expect(db.state.requests).toBe(0)
  })

  it('fout van de database: melding, geen halve lijst', async () => {
    db.state.rows = history('en/a-1', 10)
    db.state.error = { message: 'timeout' }
    await expect(listSnapshotsFor(['en/a-1'])).rejects.toThrow('Loading value history failed: timeout')
  })
})
