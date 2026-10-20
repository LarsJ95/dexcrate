// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHS_FIXTURE } from './chsData.fixture'
import { downloadChsCatalog, getChsStatus, onChsCatalogReady } from './chsCatalog'
import { autoPick, findScanCandidates } from './match'
import { getCardInfo, getSet, getSetList, searchCards } from './tcgdex'
import { imageCandidatesForKey } from './cardImages'

const SHA = 'c3b6ac6ef803aad9d60e44d058359addf3a20883'

/**
 * Nagebootst: GitHub (versie + bestand), TCGdex zh-cn met de Traditioneel-Chinese set SV8 (#062 = 棄世猴) en
 * CSV9.5C zonder kaarten, PokeAPI. Zonder IndexedDB in jsdom: de catalogus leeft dan alleen in het geheugen.
 */
function fakeFetch(url: string): Response {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })
  if (url.startsWith('https://api.github.com/repos/duanxr/PTCG-CHS-Datasets/commits')) return json([{ sha: SHA }])
  if (url === `https://raw.githubusercontent.com/duanxr/PTCG-CHS-Datasets/${SHA}/ptcg_chs_infos.json`) return json(CHS_FIXTURE)
  if (url.endsWith('/zh-cn/sets')) return json([{ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 } }, { id: 'CSV9.5C', name: '太晶盛聚', cardCount: { total: 208, official: 208 } }])
  if (url.endsWith('/zh-cn/sets/SV8')) return json({ id: 'SV8', name: '超電突圍', cardCount: { total: 106, official: 106 }, cards: [{ id: 'SV8-062', localId: '062', name: '棄世猴' }] })
  if (url.includes('/zh-cn/cards?')) return json([])
  if (url.endsWith('/zh-tw/sets') || url.includes('/zh-tw/cards?')) return json([])
  if (url.includes('pokemon-species/abra')) return json({ names: [{ name: '凯西', language: { name: 'zh-hans' } }, { name: '凱西', language: { name: 'zh-hant' } }] })
  // PokeAPI noemt Sinistea anders dan de Vereenvoudigd-Chinese kaart (斯魔茶).
  if (url.includes('pokemon-species/sinistea')) return json({ names: [{ name: '来悲茶', language: { name: 'zh-hans' } }, { name: '來悲茶', language: { name: 'zh-hant' } }] })
  return new Response('{}', { status: 404 })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => Promise.resolve(fakeFetch(String(input)))))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Chinese catalogus op dit apparaat', () => {
  it('downloaden: status klaar, melding voor opnieuw opzoeken', async () => {
    const ready = vi.fn()
    onChsCatalogReady(ready)
    await downloadChsCatalog()
    expect(getChsStatus()).toMatchObject({ kind: 'ready', cards: 7 })
    expect(ready).toHaveBeenCalledOnce()
  })

  it('set (hoofdletterongevoelig), setlijst met TCGdex-naam, zoeken en kaartinfo', async () => {
    const set = await getSet('zh-cn', 'csv9.5c')
    expect(set?.summary).toMatchObject({ id: 'CSV9.5C', official: 208, total: 5 })
    expect(set?.cards[1]).toEqual({ id: 'CSV9.5C-062', localId: '062', name: '凯西', image: `https://cdn.jsdelivr.net/gh/duanxr/PTCG-CHS-Datasets@${SHA}/img/482/155.png` })
    expect((await getSetList('zh-cn')).get('CSV9.5C')).toMatchObject({ name: '太晶盛聚', total: 5 })
    // Gem Pack uit de eigen catalogus (Engelse namen) nu ook op Chinese naam te vinden, met dezelfde sleutel.
    expect((await searchCards('zh-cn', '泡沫栗鼠')).map((c) => c.id)).toEqual(['CBB4C-1502', 'CBB4C-1505'])
    expect(await getCardInfo('zh-cn/CBB4C-1502')).toMatchObject({ name: 'Minccino' })
    expect((await searchCards('zh-cn', '凯西')).map((c) => c.id)).toEqual(['CSV9.5C-062'])
    expect(await getCardInfo('zh-cn/CSV9.5C-068')).toMatchObject({ name: '太阳伊布ex', dexId: 196, rarity: 'Double rare', suffix: 'ex', types: ['Psychic'] })
  })

  it('scan: Abra "SV8 62" (Vereenvoudigd) → CSV9.5C #062, niet 棄世猴', async () => {
    const list = await findScanCandidates({ name: 'Abra', name_printed: '凯西', set_code: 'SV8', card_number: '062', set_total: '208' }, 'zh-cn')
    expect(autoPick(list)?.key).toBe('zh-cn/CSV9.5C-062')
    expect(list.find((c) => c.key === 'zh-cn/SV8-062')?.nameDiffers).toBe(true)
  })

  it('scan: trainer zonder vertaling op gedrukte naam (Rescue Board "SV8a 173")', async () => {
    const list = await findScanCandidates({ name: 'Rescue Board', name_printed: '紧急滑板', set_code: 'SV8a', card_number: '173', set_total: '208' }, 'zh-cn')
    expect(autoPick(list)?.key).toBe('zh-cn/CSV9.5C-173')
  })

  it('scan: gedrukte naam wijkt af van PokeAPI (Sinistea 斯魔茶) → toch gevonden', async () => {
    const list = await findScanCandidates({ name: 'Sinistea', name_printed: '斯魔茶', set_code: 'SV8a', card_number: '019', set_total: '208' }, 'zh-cn')
    expect(autoPick(list)?.key).toBe('zh-cn/CSV9.5C-019')
  })

  it('scan: Gem Pack zonder setcode (Minccino 1502) → eigen catalogus CBB4C', async () => {
    const list = await findScanCandidates({ name: 'Minccino', name_printed: '泡沫栗鼠', set_code: '', card_number: '1502', set_total: '07' }, 'zh-cn')
    expect(autoPick(list)?.key).toBe('zh-cn/CBB4C-1502')
  })

  it('foto: klein via wsrv.nl, met het volledige bestand als terugval', () => {
    const full = `https://cdn.jsdelivr.net/gh/duanxr/PTCG-CHS-Datasets@${SHA}/img/482/155.png`
    expect(imageCandidatesForKey('zh-cn/CSV9.5C-062', full, 'low')).toEqual([`https://wsrv.nl/?url=${encodeURIComponent(full)}&w=250&output=webp`, full])
    expect(imageCandidatesForKey('zh-cn/CSV9.5C-062', full, 'high')).toEqual([full])
  })
})
