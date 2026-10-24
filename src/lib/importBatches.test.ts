import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, string | null>

/**
 * Nagebootste Supabase voor import ongedaan maken: kaarten en transactieregels lezen (hoogstens 1000 rijen per verzoek,
 * zoals de echte API), kaarten verwijderen en de importbatch bijwerken.
 */
const db = vi.hoisted(() => {
  const state = {
    cards: [] as Row[],
    lines: [] as Row[],
    cardsError: null as { message: string } | null,
    /** Fout bij het opzoeken van transactieregels; bij verzoek `linesErrorAt` (0 = elk verzoek). */
    linesError: null as { code: string; message: string } | null,
    linesErrorAt: 0,
    reads: [] as { table: string; ids: number; order: string[] }[],
    deletes: [] as string[][],
    updates: [] as { values: Record<string, unknown>; id: string }[],
  }
  const MAX_ROWS = 1000
  const supabase = {
    from: (table: string) => ({
      select: () => {
        const filters: ((r: Row) => boolean)[] = []
        const order: string[] = []
        let ids = 0
        const q = {
          eq: (col: string, value: string) => {
            filters.push((r) => r[col] === value)
            return q
          },
          in: (col: string, values: string[]) => {
            ids = values.length
            filters.push((r) => values.includes(String(r[col])))
            return q
          },
          order: (col: string) => {
            order.push(col)
            return q
          },
          range: (from: number, to: number) => {
            state.reads.push({ table, ids, order })
            if (table === 'cards' && state.cardsError) return Promise.resolve({ data: null, error: state.cardsError })
            const lineReads = state.reads.filter((r) => r.table === 'transaction_lines').length
            if (table === 'transaction_lines' && state.linesError && (state.linesErrorAt === 0 || state.linesErrorAt === lineReads)) {
              return Promise.resolve({ data: null, error: state.linesError })
            }
            const rows = (table === 'cards' ? state.cards : state.lines).filter((r) => filters.every((f) => f(r)))
            rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))
            return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
          },
        }
        return q
      },
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          state.deletes.push(ids)
          state.cards = state.cards.filter((c) => !ids.includes(String(c.id)))
          return Promise.resolve({ error: null })
        },
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          state.updates.push({ values, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return { state, supabase }
})
vi.mock('./supabase', () => ({ supabase: db.supabase }))

const { undoBatch } = await import('./importBatches')

const pad = (i: number): string => String(i).padStart(5, '0')
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.transaction_lines' in the schema cache" }

beforeEach(() => {
  // Import b1: 2500 kaarten, waarvan 10 al verkocht; plus 5 kaarten uit een andere import.
  db.state.cards = [
    ...Array.from({ length: 2500 }, (_, i) => ({ id: `c-${pad(i)}`, import_batch_id: 'b1', ownership: i < 10 ? 'sold' : 'owned' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `other-${i}`, import_batch_id: 'b2', ownership: 'owned' })),
  ]
  // Drie kaarten van b1 staan in een aankoop, ver voorbij de eerste 1000.
  db.state.lines = ['c-01500', 'c-02100', 'c-02499', 'other-1'].map((card, i) => ({ id: `l-${i}`, card_id: card }))
  db.state.cardsError = null
  db.state.linesError = null
  db.state.linesErrorAt = 0
  db.state.reads = []
  db.state.deletes = []
  db.state.updates = []
})

describe('undoBatch', () => {
  it('grote import: alles terug, behalve kaarten in een transactie of niet meer in bezit', async () => {
    expect(await undoBatch('b1')).toEqual({ deleted: 2487, kept: 13 })
    const deleted = db.state.deletes.flat()
    expect(new Set(deleted).size).toBe(2487)
    for (const kept of ['c-01500', 'c-02100', 'c-02499', 'c-00000', 'c-00009']) expect(deleted).not.toContain(kept)
    expect(db.state.cards.map((c) => c.id)).toEqual(['c-00000', 'c-00001', 'c-00002', 'c-00003', 'c-00004', 'c-00005', 'c-00006', 'c-00007', 'c-00008', 'c-00009', 'c-01500', 'c-02100', 'c-02499', 'other-0', 'other-1', 'other-2', 'other-3', 'other-4'])
    // Kaarten in pagina's (unieke volgorde), id's per verzoek in blokken van hoogstens 100 (korte URL).
    expect(db.state.reads.filter((r) => r.table === 'cards')).toEqual(Array.from({ length: 3 }, () => ({ table: 'cards', ids: 0, order: ['id'] })))
    const lineReads = db.state.reads.filter((r) => r.table === 'transaction_lines')
    expect(lineReads).toHaveLength(25)
    expect(lineReads.every((r) => r.ids <= 100 && r.order.join() === 'id')).toBe(true)
    expect(db.state.deletes.every((chunk) => chunk.length <= 100)).toBe(true)
    expect(db.state.updates).toEqual([{ values: { reverted_at: expect.any(String) }, id: 'b1' }])
  })

  it('transactietabel bestaat niet (STAP5 niet gedraaid): geen transacties, verder gewoon', async () => {
    db.state.linesError = MISSING
    expect(await undoBatch('b1')).toEqual({ deleted: 2490, kept: 10 })
    expect(db.state.reads.filter((r) => r.table === 'transaction_lines')).toHaveLength(1)
  })

  it('controle op transacties mislukt halverwege: niets verwijderd, import niet als ongedaan gemarkeerd', async () => {
    db.state.linesError = { code: '', message: 'TypeError: Failed to fetch' }
    db.state.linesErrorAt = 7
    await expect(undoBatch('b1')).rejects.toThrow('Undo failed: TypeError: Failed to fetch')
    // Ook "tabel bestaat niet" pas bij een later blok: fout, geen halve controle.
    db.state.reads = []
    db.state.linesError = MISSING
    db.state.linesErrorAt = 2
    await expect(undoBatch('b1')).rejects.toThrow('Undo failed: Could not find the table')
    expect(db.state.deletes).toEqual([])
    expect(db.state.updates).toEqual([])
  })

  it('tijdelijke storing "schema cache" bij het eerste blok (PGRST002): fout, geen "geen transacties"', async () => {
    db.state.linesError = { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' }
    await expect(undoBatch('b1')).rejects.toThrow('Undo failed: Could not query the database for the schema cache')
    expect(db.state.deletes).toEqual([])
    expect(db.state.updates).toEqual([])
  })

  it('kaarten ophalen mislukt: niets verwijderd', async () => {
    db.state.cardsError = { message: 'timeout' }
    await expect(undoBatch('b1')).rejects.toThrow('Undo failed: timeout')
    expect(db.state.deletes).toEqual([])
    expect(db.state.updates).toEqual([])
  })

  it('lege import: niets op te zoeken of te verwijderen', async () => {
    expect(await undoBatch('leeg')).toEqual({ deleted: 0, kept: 0 })
    expect(db.state.reads.map((r) => r.table)).toEqual(['cards'])
    expect(db.state.deletes).toEqual([])
    expect(db.state.updates).toHaveLength(1)
  })
})
