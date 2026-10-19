// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoPick, findScanCandidates } from './match'
import type { Recognition } from './scanResult'

// draftFromScan zit in scan.ts, dat de Supabase-client laadt; die is hier niet nodig.
vi.mock('./supabase', () => ({ supabase: {} }))
const { draftFromScan } = await import('./scan')

/**
 * Nagebootste TCGdex/PokeAPI: Dedenne S12 #045 bestaat alleen in de Traditioneel-Chinese catalogus (zh-tw);
 * in zh-cn vindt de naam alleen 超電突圍 #055.
 */
function fakeFetch(url: string): Response {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })
  if (url.endsWith('/zh-cn/sets')) return json([{ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 } }])
  if (url.includes('/zh-cn/cards?')) return json([{ id: 'SV8-055', localId: '055', name: '咚咚鼠' }])
  if (url.endsWith('/zh-tw/sets')) return json([{ id: 'S12', name: '思維激盪', cardCount: { total: 114, official: 98 } }])
  if (url.endsWith('/zh-tw/sets/S12')) return json({ id: 'S12', name: '思維激盪', cardCount: { total: 114, official: 98 }, cards: [{ id: 'S12-045', localId: '045', name: '咚咚鼠' }] })
  if (url.includes('/zh-tw/cards?')) return json([{ id: 'S12-045', localId: '045', name: '咚咚鼠' }])
  if (url.includes('pokemon-species/dedenne')) {
    return json({ names: [{ name: '咚咚鼠', language: { name: 'zh-hans' } }, { name: '咚咚鼠', language: { name: 'zh-hant' } }] })
  }
  return new Response('{}', { status: 404 })
}

const fetchMock = vi.fn((input: string | URL) => Promise.resolve(fakeFetch(String(input))))
beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const rec: Recognition = {
  position: 1,
  namePrinted: '咚咚鼠',
  nameEnglish: 'Dedenne',
  language: 'zh-cn',
  setCode: 'S12',
  cardNumber: '045',
  setTotal: '098',
  variant: 'normal',
  confidence: 'high',
  notes: '',
}

describe('scan: Vereenvoudigd en Traditioneel Chinees verward', () => {
  it('niets met het nummer in de gelezen taal: kaart uit de verwante taal komt bovenaan en wordt gekozen', async () => {
    const list = await findScanCandidates({ name: 'Dedenne', set_code: 'S12', card_number: '045', set_total: '098' }, 'zh-cn')
    expect(list[0]).toMatchObject({ key: 'zh-tw/S12-045' })
    expect(list[0].reason).toContain('(Chinese (traditional))')
    expect(autoPick(list)?.key).toBe('zh-tw/S12-045')
    // De suggestie met een ander nummer uit de gelezen taal blijft eronder staan.
    expect(list.map((c) => c.key)).toContain('zh-cn/SV8-055')
  })

  it('wel een match in de gelezen taal: niet in de andere taal zoeken', async () => {
    const list = await findScanCandidates({ name: 'Dedenne', set_code: 'S12', card_number: '045', set_total: null }, 'zh-tw')
    expect(autoPick(list)?.key).toBe('zh-tw/S12-045')
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/zh-cn/'))).toBe(false)
  })

  it('geen nummer gelezen: niet in de andere taal zoeken (niets om op te controleren)', async () => {
    await findScanCandidates({ name: 'Dedenne', set_code: null, card_number: null }, 'zh-cn')
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/zh-tw/'))).toBe(false)
  })

  it('toevoegen: taal en setcode volgen de gekozen kaart', async () => {
    const [best] = await findScanCandidates({ name: 'Dedenne', set_code: 'S12', card_number: '045', set_total: '098' }, 'zh-cn')
    const draft = await draftFromScan(rec, best, 'zh-cn')
    expect(draft).toMatchObject({ language: 'zh-tw', tcgdex_id: 'zh-tw/S12-045', set_code: 'S12', card_number: '45' })
    // Zonder koppeling blijft de gelezen taal.
    expect((await draftFromScan(rec, null, 'zh-cn')).language).toBe('zh-cn')
  })
})
