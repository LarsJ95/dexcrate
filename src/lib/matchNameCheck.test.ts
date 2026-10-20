// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoPick, baseLocalName, checkLocalName, findCandidates, findScanCandidates, resolveTcgdexIds } from './match'
import type { CardInput } from './types'

/**
 * Nagebootste TCGdex/PokeAPI met de echte gevallen van 20-10-2026: TCGdex zh-cn bevat de Traditioneel-Chinese set
 * SV8, waar #062 棄世猴 (Annihilape) is en #055 咚咚鼠 (Dedenne). Een Vereenvoudigd-Chinese Abra (凯西) met
 * gelezen "SV8 62" werd daardoor aan Annihilape gekoppeld.
 */
const SV8_CARDS = [
  { id: 'SV8-055', localId: '055', name: '咚咚鼠' },
  { id: 'SV8-062', localId: '062', name: '棄世猴' },
  { id: 'SV8-090', localId: '090', name: '納莉' },
  { id: 'SV8-091', localId: '091', name: '緊急滑板' },
]

const SPECIES: Record<string, { hans: string; hant: string }> = {
  abra: { hans: '凯西', hant: '凱西' },
  dedenne: { hans: '咚咚鼠', hant: '咚咚鼠' },
}

function fakeFetch(url: string): Response {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })
  if (url.endsWith('/zh-cn/sets')) return json([{ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 } }])
  if (url.endsWith('/zh-cn/sets/SV8')) return json({ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 }, cards: SV8_CARDS })
  if (url.includes('/zh-cn/cards?')) {
    const name = decodeURIComponent(/name=([^&]*)/.exec(url)?.[1] ?? '')
    return json(SV8_CARDS.filter((c) => c.name.includes(name.replace(/^(like|eq):/, ''))))
  }
  if (url.endsWith('/zh-tw/sets')) return json([])
  if (url.includes('/zh-tw/cards?')) return json([])
  const species = /pokemon-species\/([a-z0-9-]+)/.exec(url)?.[1]
  if (species && SPECIES[species]) {
    const n = SPECIES[species]
    return json({ names: [{ name: n.hans, language: { name: 'zh-hans' } }, { name: n.hant, language: { name: 'zh-hant' } }] })
  }
  return new Response('{}', { status: 404 })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => Promise.resolve(fakeFetch(String(input)))))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('baseLocalName', () => {
  it('haalt suffix, eigenaar en Mega weg', () => {
    expect(baseLocalName('太阳伊布ex')).toBe('太阳伊布')
    expect(baseLocalName('玛俐的莫鲁贝可')).toBe('莫鲁贝可')
    expect(baseLocalName('マリィのモルペコ')).toBe('モルペコ')
    expect(baseLocalName('超级喷火龙 ex')).toBe('喷火龙')
  })
})

describe('checkLocalName', () => {
  it('Pokémon: vertaling in een van beide schriften moet gelijk zijn', async () => {
    expect(await checkLocalName({ name: 'Abra' }, 'zh-cn', '棄世猴')).toBe('differs')
    expect(await checkLocalName({ name: 'Abra' }, 'zh-cn', '凱西')).toBe('same')
    expect(await checkLocalName({ name: 'Dedenne' }, 'zh-cn', '咚咚鼠')).toBe('same')
  })

  it('trainer zonder vertaling: gedrukte naam, ook in het andere schrift', async () => {
    expect(await checkLocalName({ name: 'Rescue Board', name_printed: '紧急滑板' }, 'zh-cn', '緊急滑板')).toBe('same')
    expect(await checkLocalName({ name: 'Rescue Board', name_printed: '紧急滑板' }, 'zh-cn', '納莉')).toBe('differs')
  })

  it('niets om mee te vergelijken: onbekend (dan geldt set + nummer, zoals voorheen)', async () => {
    expect(await checkLocalName({ name: 'Rescue Board' }, 'zh-cn', '納莉')).toBe('unknown')
  })
})

describe('set + nummer met een andere kaart', () => {
  it('Abra op SV8 #062 (棄世猴): alleen een suggestie met uitleg, niet vanzelf gekozen', async () => {
    const list = await findCandidates({ name: 'Abra', name_printed: '凯西', set_code: 'SV8', card_number: '62', set_total: null }, 'zh-cn')
    expect(list[0]).toMatchObject({ key: 'zh-cn/SV8-062', nameDiffers: true, reason: 'Other card at this number: 棄世猴' })
    expect(autoPick(list)).toBe(null)
    expect(autoPick(await findScanCandidates({ name: 'Abra', name_printed: '凯西', set_code: 'SV8', card_number: '62' }, 'zh-cn'))).toBe(null)
  })

  it('trainer met andere naam op het nummer (納莉 i.p.v. Rescue Board): niet vanzelf gekozen', async () => {
    const list = await findCandidates({ name: 'Rescue Board', name_printed: '紧急滑板', set_code: 'SV8', card_number: '90' }, 'zh-cn')
    expect(list.find((c) => c.key === 'zh-cn/SV8-090')?.nameDiffers).toBe(true)
    expect(autoPick(list)?.key).not.toBe('zh-cn/SV8-090')
  })

  it('zelfde kaart: gewoon gekozen', async () => {
    const list = await findCandidates({ name: 'Dedenne', name_printed: '咚咚鼠', set_code: 'SV8', card_number: '55' }, 'zh-cn')
    expect(autoPick(list)?.key).toBe('zh-cn/SV8-055')
    expect(list[0].nameDiffers).toBeUndefined()
  })

  it('importeren: andere naam op set + nummer → niet koppelen', async () => {
    const base: CardInput = { kind: 'card', name: 'Abra', set_code: 'SV8', card_number: '62', language: 'zh-cn', tcgdex_id: null } as CardInput
    const [abra, dedenne] = await resolveTcgdexIds([base, { ...base, name: 'Dedenne', card_number: '55' }])
    expect(abra.tcgdex_id).toBe(null)
    expect(dedenne.tcgdex_id).toBe('zh-cn/SV8-055')
  })
})
