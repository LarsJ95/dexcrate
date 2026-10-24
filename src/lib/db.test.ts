import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { tcgdex_id: string; taken_on: string; trend: number; trend_holo: number | null }

/** Nagebootste price_snapshots: filtert, sorteert en geeft hoogstens 1000 rijen per verzoek, zoals de echte API (max_rows). */
const db = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    requests: 0,
    error: null as { message: string } | null,
  }
  const MAX_ROWS = 1000
  const supabase = {
    from: () => {
      let ids: string[] = []
      const orders: ('tcgdex_id' | 'taken_on')[] = []
      const respond = (from: number, to: number) => {
        state.requests += 1
        if (state.error) return Promise.resolve({ data: null, error: state.error })
        const sorted = state.rows
          .filter((r) => ids.includes(r.tcgdex_id))
          .sort((a, b) => {
            for (const col of orders) if (a[col] !== b[col]) return a[col] < b[col] ? -1 : 1
            return 0
          })
        return Promise.resolve({ data: sorted.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
      }
      const q = {
        select: () => q,
        in: (_col: string, values: string[]) => {
          ids = values
          return q
        },
        order: (col: 'tcgdex_id' | 'taken_on') => {
          orders.push(col)
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

const { listSnapshotsFor } = await import('./db')

const day = (d: number): string => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)
const history = (id: string, days: number): Row[] =>
  Array.from({ length: days }, (_, d) => ({ tcgdex_id: id, taken_on: day(d), trend: d, trend_holo: null }))

beforeEach(() => {
  db.state.rows = []
  db.state.requests = 0
  db.state.error = null
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
