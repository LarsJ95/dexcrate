// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogLocalId, findCandidates } from './match'

/** Nagebootste TCGdex/PokeAPI: Shiny Star V (S4a) staat in TCGdex, maar zonder kaartenlijst. */
function fakeFetch(url: string): Response {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })
  if (url.endsWith('/ja/sets/S4a')) return json({ id: 'S4a', name: 'シャイニースターV', cardCount: { total: 190, official: 190 }, cards: [] })
  if (url.endsWith('/ja/sets/SV8')) {
    return json({ id: 'SV8', name: '超電ブレイカー', cardCount: { total: 106, official: 106 }, cards: [{ id: 'SV8-033', localId: '033', name: 'ピカチュウex' }] })
  }
  if (url.endsWith('/ja/sets')) return json([{ id: 'S4a', name: 'シャイニースターV', cardCount: { total: 190, official: 190 } }, { id: 'SV8', name: '超電ブレイカー', cardCount: { total: 106, official: 106 } }])
  if (url.includes('/ja/cards?')) return json([])
  if (url.includes('pokemon-species/pikachu')) return json({ names: [{ name: 'ピカチュウ', language: { name: 'ja-hrkt' } }] })
  return new Response('{}', { status: 404 })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => Promise.resolve(fakeFetch(String(input)))))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('catalogLocalId', () => {
  it('nummers met drie cijfers, zoals TCGdex', () => {
    expect(catalogLocalId('16')).toBe('016')
    expect(catalogLocalId('016')).toBe('016')
    expect(catalogLocalId('250')).toBe('250')
    expect(catalogLocalId('TG05')).toBe('TG05')
  })
})

describe('set zonder kaartenlijst', () => {
  it('geeft een kandidaat op set + nummer', async () => {
    const [best] = await findCandidates({ name: 'Pikachu', set_code: 'S4a', card_number: '16', set_total: '190' }, 'ja')
    expect(best).toMatchObject({ key: 'ja/S4a-016', name: 'Pikachu', localId: '016', setId: 'S4a', noCardData: true })
  })

  it('niet als het gedrukte totaal niet bij de set past (verkeerd gelezen set)', async () => {
    const list = await findCandidates({ name: 'Pikachu', set_code: 'S4a', card_number: '16', set_total: '165' }, 'ja')
    expect(list.some((c) => c.noCardData)).toBe(false)
  })

  it('niet bij een set met kaartenlijst waarin het nummer ontbreekt', async () => {
    const list = await findCandidates({ name: 'Pikachu', set_code: 'SV8', card_number: '99', set_total: '106' }, 'ja')
    expect(list.some((c) => c.noCardData)).toBe(false)
  })
})
