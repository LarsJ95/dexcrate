// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoPick, findCandidates } from './match'

/**
 * Nagebootste TCGdex/PokeAPI: een Dedenne uit een set die geen enkele catalogus kent ("XXMC", verzonnen; zo ging het
 * met CSMC tot die op 19-10-2026 in de eigen catalogus kwam). Op naam vindt TCGdex alleen Dedenne 超電突圍 #055.
 */
function fakeFetch(url: string): Response {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })
  if (url.endsWith('/zh-cn/sets')) return json([{ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 } }])
  if (url.includes('/zh-cn/cards?')) return json([{ id: 'SV8-055', localId: '055', name: '咚咚鼠' }])
  if (url.includes('pokemon-species/dedenne')) return json({ names: [{ name: '咚咚鼠', language: { name: 'zh-hans' } }] })
  return new Response('{}', { status: 404 })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => Promise.resolve(fakeFetch(String(input)))))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gelezen nummer klopt niet', () => {
  it('set onbekend in de catalogus: alleen een suggestie op naam, niet vanzelf kiezen', async () => {
    const list = await findCandidates({ name: 'Dedenne', set_code: 'XXMC', card_number: '004', set_total: '012' }, 'zh-cn')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ key: 'zh-cn/SV8-055', otherNumber: true, reason: 'Name (咚咚鼠), other number' })
    expect(autoPick(list)).toBe(null)
  })

  it('zelfde naam en nummer: gewoon de beste match', async () => {
    const list = await findCandidates({ name: 'Dedenne', set_code: null, card_number: '55', set_total: null }, 'zh-cn')
    expect(list[0].otherNumber).toBeUndefined()
    expect(autoPick(list)?.key).toBe('zh-cn/SV8-055')
  })

  it('geen nummer gelezen: naam is alles wat er is, zoals voorheen', async () => {
    const list = await findCandidates({ name: 'Dedenne', set_code: null, card_number: null }, 'zh-cn')
    expect(list[0].otherNumber).toBeUndefined()
    expect(autoPick(list)?.key).toBe('zh-cn/SV8-055')
  })
})
