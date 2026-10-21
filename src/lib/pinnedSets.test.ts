import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  stored: { condition_pct: { NM: 100 }, pinned_sets: [{ lang: 'en', setId: 'sv03.5', name: '151' }] } as Record<string, unknown>,
  upserts: [] as unknown[],
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: { settings: db.stored }, error: null }) }),
      upsert: async (row: { settings: Record<string, unknown> }) => {
        db.upserts.push(row)
        db.stored = row.settings
        return { error: null }
      },
    }),
  },
}))

const { MAX_PINNED, loadPinned, parsePinned, savePinned, withPin } = await import('./pinnedSets')
const { saveSettings } = await import('./valuationDb')

const p = (setId: string, lang: 'en' | 'ja' = 'en') => ({ lang, setId, name: setId })

describe('parsePinned', () => {
  it('alleen geldige sets, zonder dubbele, hoogstens 5', () => {
    const raw = [p('a'), { lang: 'xx', setId: 'b', name: 'B' }, { lang: 'en', setId: '', name: 'C' }, p('a'), 'rommel', p('d', 'ja'), p('e'), p('f'), p('g'), p('h')]
    expect(parsePinned(raw).map((s) => `${s.lang}/${s.setId}`)).toEqual(['en/a', 'ja/d', 'en/e', 'en/f', 'en/g'])
    expect(parsePinned(null)).toEqual([])
    expect(parsePinned([{ lang: 'en', setId: 'x', name: '  ' }])[0].name).toBe('x')
  })
})

describe('withPin', () => {
  it('vastzetten achteraan, losmaken, en vol = niets', () => {
    expect(withPin([p('a')], p('b'), true).map((s) => s.setId)).toEqual(['a', 'b'])
    expect(withPin([p('a'), p('b')], p('a'), false).map((s) => s.setId)).toEqual(['b'])
    const full = Array.from({ length: MAX_PINNED }, (_, i) => p(`s${i}`))
    expect(withPin(full, p('x'), true)).toHaveLength(MAX_PINNED)
    expect(withPin([p('a')], p('a'), true)).toHaveLength(1)
  })
})

describe('opslaan in je instellingen', () => {
  it('vastzetten laat de waarde-instellingen staan en andersom', async () => {
    await savePinned([p('sv03.5'), p('SV2a', 'ja')])
    expect(db.stored.condition_pct).toEqual({ NM: 100 })
    expect(await loadPinned()).toHaveLength(2)

    await saveSettings({ conditionPct: { NM: 90 }, saleFeePct: null, saleCostPerSale: null, defaults: { language: null, condition: null, set_code: null, location_id: null } })
    expect(db.stored.condition_pct).toEqual({ NM: 90 })
    expect(await loadPinned()).toHaveLength(2)
  })
})
