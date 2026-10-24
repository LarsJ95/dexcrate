import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, fetchAllPages, type PageError } from './fetchAll'

/** Nagebootste API met `total` rijen: hoogstens 1000 per verzoek (max_rows), ook als je om meer vraagt. */
function api(total: number, failAt?: number) {
  const rows = Array.from({ length: total }, (_, i) => i)
  const calls: [number, number][] = []
  const page = (from: number, to: number): Promise<{ data: number[] | null; error: PageError | null }> => {
    calls.push([from, to])
    if (calls.length === failAt) return Promise.resolve({ data: null, error: { message: 'timeout', code: '57014' } })
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
  }
  return { rows, calls, page }
}

describe('fetchAllPages', () => {
  it('pagina’s van 1000 (de standaard max_rows van Supabase)', () => {
    expect(PAGE_SIZE).toBe(1000)
  })

  it('minder dan 1000 rijen of leeg: één verzoek', async () => {
    const small = api(10)
    expect(await fetchAllPages(small.page)).toEqual({ data: small.rows, error: null })
    expect(small.calls).toEqual([[0, 999]])
    const empty = api(0)
    expect(await fetchAllPages(empty.page)).toEqual({ data: [], error: null })
    expect(empty.calls).toHaveLength(1)
  })

  it('meer dan 1000: alles, in volgorde, geen dubbele', async () => {
    const big = api(2500)
    expect(await fetchAllPages(big.page)).toEqual({ data: big.rows, error: null })
    expect(big.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('precies 1000: één extra verzoek om zeker te weten dat het op is', async () => {
    const exact = api(1000)
    const { data } = await fetchAllPages(exact.page)
    expect(data).toHaveLength(1000)
    expect(exact.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('fout op een latere pagina: de fout, geen halve lijst', async () => {
    const failing = api(2500, 2)
    expect(await fetchAllPages(failing.page)).toEqual({ data: null, error: { message: 'timeout', code: '57014' } })
    expect(failing.calls).toHaveLength(2)
  })

  it('antwoord zonder lijst: fout (liever geen dan een lege lijst die niet klopt)', async () => {
    const res = await fetchAllPages(() => Promise.resolve({ data: null, error: null }))
    expect(res).toEqual({ data: null, error: { message: 'Unexpected response from the database.' } })
  })

  it('max: hoogstens zoveel rijen; het laatste verzoek gaat precies tot de grens', async () => {
    const many = api(7000)
    const { data } = await fetchAllPages(many.page, { max: 2500 })
    expect(data).toEqual(many.rows.slice(0, 2500))
    expect(many.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
    const round = api(7000)
    expect((await fetchAllPages(round.page, { max: 5000 })).data).toHaveLength(5000)
    expect(round.calls).toHaveLength(5)
    // Minder dan max aanwezig: gewoon alles.
    const few = api(1200)
    expect((await fetchAllPages(few.page, { max: 5000 })).data).toHaveLength(1200)
    expect(few.calls).toHaveLength(2)
  })
})
