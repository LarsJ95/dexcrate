// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from './match'
import type { Recognition } from './scanResult'
import type { CardInfo } from './tcgdex'

/** Nagebootste Supabase: sessie, tabel scan_choices (lezen in pagina's van hoogstens 1000, upsert, delete). */
const db = vi.hoisted(() => {
  const state = {
    session: { user: { id: 'u1' } } as { user: { id: string } } | null,
    rows: [] as { read_key: string; card_key: string; updated_at?: string }[],
    selectError: null as { code: string; message: string } | null,
    ranges: [] as [number, number][],
    upserts: [] as { rows: unknown; opts: unknown }[],
    deletes: [] as string[][],
  }
  const supabase = {
    auth: { getSession: () => Promise.resolve({ data: { session: state.session } }) },
    from: () => ({
      select: () => {
        const orders: { col: 'read_key' | 'updated_at'; ascending: boolean }[] = []
        const q = {
          order: (col: 'read_key' | 'updated_at', opts: { ascending: boolean }) => {
            orders.push({ col, ascending: opts.ascending })
            return q
          },
          range: (from: number, to: number) => {
            state.ranges.push([from, to])
            if (state.selectError) return Promise.resolve({ data: null, error: state.selectError })
            const rows = [...state.rows].sort((a, b) => {
              for (const { col, ascending } of orders) {
                const x = a[col] ?? ''
                const y = b[col] ?? ''
                if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1)
              }
              return 0
            })
            // Zoals de echte API: hoogstens 1000 rijen per verzoek.
            return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
          },
        }
        return q
      },
      upsert: (rows: unknown, opts: unknown) => {
        state.upserts.push({ rows, opts })
        return Promise.resolve({ error: null })
      },
      delete: () => ({
        in: (_col: string, keys: string[]) => {
          state.deletes.push(keys)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return { state, supabase }
})
vi.mock('./supabase', () => ({ supabase: db.supabase }))
vi.mock('./tcgdex', async (importOriginal) => ({ ...(await importOriginal<typeof import('./tcgdex')>()), getCardInfo: vi.fn() }))

const { getCardInfo } = await import('./tcgdex')
const { autoPick } = await import('./match')
const { readKey, recordChoices, resetScanMemoryForTests, withMemory } = await import('./scanMemory')

const rec = (over: Partial<Recognition> = {}): Recognition => ({
  position: 1,
  namePrinted: '咚咚鼠',
  nameEnglish: 'Dedenne',
  language: 'zh-cn',
  setCode: 'CSMC',
  cardNumber: '004',
  setTotal: '012',
  variant: 'holo',
  confidence: 'high',
  notes: '',
  ...over,
})
const cand = (key: string, score: number, over: Partial<Candidate> = {}): Candidate => ({ key, name: 'Dedenne', localId: key.slice(-3), setId: 'X', setName: 'X', image: null, score, reason: '', ...over })

beforeEach(() => {
  localStorage.clear()
  resetScanMemoryForTests()
  db.state.session = { user: { id: 'u1' } }
  db.state.rows = []
  db.state.selectError = null
  db.state.ranges = []
  db.state.upserts = []
  db.state.deletes = []
})

describe('laden uit je account', () => {
  it('meer dan 5000 keuzes: de nieuwste 5000 (in pagina’s); op het apparaat de nieuwste 500', async () => {
    const at = (i: number): string => new Date(Date.UTC(2026, 9, 20, 0, 0, i)).toISOString()
    db.state.rows = Array.from({ length: 6000 }, (_, i) => ({ read_key: `k${String(i).padStart(4, '0')}`, card_key: `c${i}`, updated_at: at(i) }))
    db.state.rows.push({ read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-tw/S12-045', updated_at: at(9999) })
    const list = await withMemory(rec(), [cand('zh-cn/SV8-055', 3), cand('zh-tw/S12-045', 2)])
    expect(list[0].key).toBe('zh-tw/S12-045')
    expect(db.state.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
    ])
    const local = JSON.parse(localStorage.getItem('dexcrate:scan-memory:u1') ?? '[]') as [string, string][]
    expect(local).toHaveLength(500)
    expect(local[0]).toEqual(['k5501', 'c5501'])
    expect(local.at(-1)).toEqual(['zh-cn|CSMC|4|dedenne', 'zh-tw/S12-045'])
  })
})

describe('readKey', () => {
  it('taal, setcode, nummer zonder voorloopnullen en spaties, naam zonder tekens', () => {
    expect(readKey(rec())).toBe('zh-cn|CSMC|4|dedenne')
    expect(readKey(rec({ setCode: ' cbb3c ', cardNumber: '14 01', nameEnglish: 'Morpeko' }))).toBe('zh-cn|CBB3C|1401|morpeko')
    expect(readKey(rec({ language: 'de', setCode: 'MEW', cardNumber: '151', nameEnglish: 'Mew ex' }))).toBe('en|MEW|151|mewex')
    expect(readKey(rec({ language: 'en', nameEnglish: 'Flabébé' }))).toBe('en|CSMC|4|flabebe')
  })

  it('zonder setcode én nummer, of zonder naam: geen sleutel', () => {
    expect(readKey(rec({ setCode: '', cardNumber: '' }))).toBeNull()
    expect(readKey(rec({ nameEnglish: '', namePrinted: '' }))).toBeNull()
    expect(readKey(rec({ setCode: '' }))).toBe('zh-cn||4|dedenne')
  })
})

describe('withMemory', () => {
  it('eerdere keuze uit de lijst komt bovenaan, als echte keuze (geen "ander nummer" meer)', async () => {
    db.state.rows = [{ read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-tw/S12-045' }]
    const found = [cand('zh-cn/SV8-055', 3, { otherNumber: true }), cand('zh-tw/S12-045', 3, { otherNumber: true })]
    const list = await withMemory(rec(), found)
    expect(list.map((c) => c.key)).toEqual(['zh-tw/S12-045', 'zh-cn/SV8-055'])
    expect(list[0]).toMatchObject({ remembered: true, reason: 'Your earlier choice', score: 4 })
    expect(list[0].otherNumber).toBeUndefined()
    expect(autoPick(list)?.key).toBe('zh-tw/S12-045')
  })

  it('eerdere keuze niet gevonden: uit de catalogus erbij gehaald', async () => {
    db.state.rows = [{ read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-cn/CSMC-004' }]
    const info: CardInfo = { key: 'zh-cn/CSMC-004', lang: 'zh-cn', name: 'Dedenne', localId: '004', image: null, set: { id: 'CSMC', name: 'Pokémon Card Display Set Gift Box Charizard', logo: null } }
    vi.mocked(getCardInfo).mockResolvedValueOnce(info)
    const list = await withMemory(rec(), [cand('zh-cn/SV8-055', 3, { otherNumber: true })])
    expect(list[0]).toMatchObject({ key: 'zh-cn/CSMC-004', setId: 'CSMC', setName: 'Pokémon Card Display Set Gift Box Charizard', remembered: true })
    expect(list).toHaveLength(2)
  })

  it('zelfde als wat de app al koos, geen sessie of geen eerdere keuze: ongewijzigd', async () => {
    const found = [cand('zh-cn/CSMC-004', 8)]
    db.state.rows = [{ read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-cn/CSMC-004' }]
    expect(await withMemory(rec(), found)).toBe(found)
    resetScanMemoryForTests()
    db.state.session = null
    expect(await withMemory(rec(), [cand('a/b-001', 1)])).toHaveLength(1)
    resetScanMemoryForTests()
    db.state.session = { user: { id: 'u1' } }
    db.state.rows = []
    const other = [cand('a/b-001', 1)]
    expect(await withMemory(rec(), other)).toBe(other)
  })

  it('STAP20 niet gedraaid: keuzes van dit apparaat', async () => {
    db.state.selectError = { code: 'PGRST205', message: 'Could not find the table' }
    localStorage.setItem('dexcrate:scan-memory:u1', JSON.stringify([['zh-cn|CSMC|4|dedenne', 'zh-tw/S12-045']]))
    const list = await withMemory(rec(), [cand('zh-cn/SV8-055', 3), cand('zh-tw/S12-045', 2)])
    expect(list[0].key).toBe('zh-tw/S12-045')
  })
})

describe('recordChoices', () => {
  const found = [cand('zh-cn/SV8-055', 6), cand('zh-tw/S12-045', 5)]

  it('andere kaart dan de app koos: opslaan in je account en op het apparaat', async () => {
    await recordChoices([{ rec: rec(), candidates: found, chosen: 'zh-tw/S12-045' }])
    expect(db.state.upserts).toHaveLength(1)
    expect(db.state.upserts[0].opts).toEqual({ onConflict: 'user_id,read_key' })
    expect(db.state.upserts[0].rows).toEqual([expect.objectContaining({ user_id: 'u1', read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-tw/S12-045' })])
    expect(JSON.parse(localStorage.getItem('dexcrate:scan-memory:u1') ?? '[]')).toEqual([['zh-cn|CSMC|4|dedenne', 'zh-tw/S12-045']])
  })

  it('zelfde als de app, of zonder koppeling: niets opslaan', async () => {
    await recordChoices([
      { rec: rec(), candidates: found, chosen: 'zh-cn/SV8-055' },
      { rec: rec(), candidates: found, chosen: null },
      { rec: null, candidates: found, chosen: 'zh-tw/S12-045' },
      { rec: rec({ setCode: '', cardNumber: '' }), candidates: found, chosen: 'zh-tw/S12-045' },
    ])
    expect(db.state.upserts).toHaveLength(0)
    expect(db.state.deletes).toHaveLength(0)
  })

  it('terug naar wat de app zelf koos: eerdere keuze vergeten', async () => {
    db.state.rows = [{ read_key: 'zh-cn|CSMC|4|dedenne', card_key: 'zh-tw/S12-045' }]
    const shown = await withMemory(rec(), found)
    expect(shown[0].remembered).toBe(true)
    await recordChoices([{ rec: rec(), candidates: shown, chosen: 'zh-cn/SV8-055' }])
    expect(db.state.deletes).toEqual([['zh-cn|CSMC|4|dedenne']])
    expect(db.state.upserts).toHaveLength(0)
    // De eerdere keuze nogmaals bevestigen: niets te doen (blijft staan).
    db.state.deletes = []
    resetScanMemoryForTests()
    const again = await withMemory(rec(), found)
    await recordChoices([{ rec: rec(), candidates: again, chosen: 'zh-tw/S12-045' }])
    expect(db.state.upserts).toHaveLength(1)
  })

  it('STAP20 niet gedraaid: alleen op dit apparaat, geen fout', async () => {
    db.state.selectError = { code: 'PGRST205', message: 'Could not find the table' }
    await recordChoices([{ rec: rec(), candidates: found, chosen: 'zh-tw/S12-045' }])
    expect(db.state.upserts).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('dexcrate:scan-memory:u1') ?? '[]')).toEqual([['zh-cn|CSMC|4|dedenne', 'zh-tw/S12-045']])
  })
})
