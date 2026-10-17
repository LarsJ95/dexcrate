import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSetRarities } from './tcgdex'

afterEach(() => vi.unstubAllGlobals())

describe('getSetRarities', () => {
  it('voegt pagina’s samen en houdt alleen kaarten van deze set', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `swsh12.5-${String(i + 1).padStart(3, '0')}`, rarity: 'Common' }))
    // Het id-filter zoekt op tekst: een kaart uit een andere set kan meekomen en moet eruit.
    const page2 = [{ id: 'swsh12.5-101', rarity: 'Secret Rare' }, { id: 'xswsh12.5-001', rarity: 'Rare' }, { id: 'swsh12.5-102', rarity: null }]
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(String(init.body)) as { variables: { id: string; page: number } }
      expect(variables.id).toBe('swsh12.5-')
      return new Response(JSON.stringify({ data: { cards: variables.page === 1 ? page1 : page2 } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const map = await getSetRarities('en', 'swsh12.5')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(map?.size).toBe(102)
    expect(map?.get('swsh12.5-101')).toBe('Secret Rare')
    expect(map?.get('swsh12.5-102')).toBeNull()
    expect(map?.has('xswsh12.5-001')).toBe(false)
  })

  it('andere talen: null (dan per kaart ophalen)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await getSetRarities('ja', 'SV2a')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
