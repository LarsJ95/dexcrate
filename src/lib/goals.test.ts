import { describe, expect, it, vi } from 'vitest'
import { EMPTY_CARD } from './types'
import { ownedForWish } from './wishlist'
import { DEFAULT_GOAL, goalProgress, goalRequirements, splitProgress, type GoalSettings, type OwnedCopy } from './goals'
import type { Variant } from './types'

// wishlist.ts maakt bij import een Supabase-client; die is hier niet nodig.
vi.mock('./supabase', () => ({ supabase: {} }))

const cards = [
  { id: 's-1', localId: '1' },
  { id: 's-2', localId: '2' },
  { id: 's-3', localId: '3' }, // ex: alleen holo
  { id: 's-4', localId: '4' }, // secret rare (officieel 3 kaarten)
]
const variants = new Map<string, Variant[] | null>([
  ['s-1', ['normal', 'reverse']],
  ['s-2', ['normal', 'reverse']],
  ['s-3', ['holo']],
  ['s-4', ['holo']],
])
const copy = (cardId: string, variant: Variant | null, patch: Partial<OwnedCopy> = {}): OwnedCopy => ({
  cardId,
  variant,
  language: 'en',
  quantity: 1,
  incoming: false,
  ...patch,
})
const goal = (patch: Partial<GoalSettings>): GoalSettings => ({ ...DEFAULT_GOAL, ...patch })

describe('goalRequirements', () => {
  it('zonder uitvoeringen: één vakje per kaart', () => {
    expect(goalRequirements(cards, variants, DEFAULT_GOAL, 3)).toHaveLength(4)
  })

  it('per uitvoering, alleen bestaande (ex-kaart krijgt geen reverse-vakje)', () => {
    const reqs = goalRequirements(cards, variants, goal({ variants: ['normal', 'reverse', 'holo'] }), 3)
    expect(reqs.map((r) => `${r.cardId}:${r.variant}`)).toEqual(['s-1:normal', 's-1:reverse', 's-2:normal', 's-2:reverse', 's-3:holo', 's-4:holo'])
  })

  it('secret rares weglaten', () => {
    expect(goalRequirements(cards, variants, goal({ includeSecret: false }), 3).map((r) => r.cardId)).toEqual(['s-1', 's-2', 's-3'])
  })

  it('onbekende uitvoeringen: één vakje "elke uitvoering", gemarkeerd', () => {
    const reqs = goalRequirements([{ id: 'x-1', localId: '1' }], new Map(), goal({ variants: ['reverse'] }), null)
    expect(reqs).toEqual([{ cardId: 'x-1', variant: null, variantsUnknown: true }])
  })
})

describe('goalProgress', () => {
  const variantGoal = goal({ variants: ['normal', 'reverse'] })
  const reqs = goalRequirements(cards.slice(0, 2), variants, variantGoal, 3)

  it('een normale kaart vinkt de ontbrekende reverse holo niet af', () => {
    const p = goalProgress(reqs, [copy('s-1', 'normal')], variantGoal)
    expect(p.done).toBe(1)
    expect(p.total).toBe(4)
    expect(p.states.find((s) => s.req.cardId === 's-1' && s.req.variant === 'reverse')?.missing).toBe(1)
    // Kaart zelf telt wel als "kaart in bezit".
    expect(p.cardsOwned).toBe(1)
  })

  it('dubbele exemplaren boven het gewenste aantal', () => {
    const p = goalProgress(reqs, [copy('s-1', 'normal', { quantity: 3 })], variantGoal)
    expect(p.duplicates).toBe(2)
  })

  it('onderweg telt pas mee als het doel dat zegt', () => {
    const incoming = [copy('s-2', 'reverse', { incoming: true })]
    expect(goalProgress(reqs, incoming, variantGoal)).toMatchObject({ done: 0, ordered: 1 })
    expect(goalProgress(reqs, incoming, { ...variantGoal, includeIncoming: true })).toMatchObject({ done: 1, ordered: 0 })
  })

  it('alleen meetellende talen; exemplaar zonder taal telt dan niet', () => {
    const jaGoal = goal({ languages: ['ja'] })
    const r = goalRequirements(cards.slice(0, 1), variants, jaGoal, 3)
    expect(goalProgress(r, [copy('s-1', 'normal'), copy('s-1', 'normal', { language: null })], jaGoal).done).toBe(0)
    expect(goalProgress(r, [copy('s-1', 'normal', { language: 'ja' })], jaGoal).done).toBe(1)
  })

  it('exemplaren zonder bekende uitvoering worden gemeld bij een doel per uitvoering', () => {
    expect(goalProgress(reqs, [copy('s-1', null)], variantGoal)).toMatchObject({ done: 0, unknownVariant: 1 })
  })
})

describe('ownedForWish', () => {
  const item = {
    id: 'w', tcgdex_id: 'en/sv03.5-151', name: 'Mew ex', set_code: 'MEW', card_number: '151', variant: 'reverse' as const,
    language: null, min_condition: null, wanted_qty: 1, max_price: null, priority: 2 as const, notes: null, created_at: '',
  }
  const card = { ...EMPTY_CARD, name: 'Mew ex', tcgdex_id: 'en/sv03.5-151' }

  it('telt alleen dezelfde uitvoering; onderweg apart; verkocht niet', () => {
    expect(ownedForWish(item, [{ ...card, variant: 'normal' }])).toEqual({ owned: 0, incoming: 0 })
    expect(ownedForWish(item, [{ ...card, variant: 'reverse', quantity: 2 }])).toEqual({ owned: 2, incoming: 0 })
    expect(ownedForWish(item, [{ ...card, variant: 'reverse', ownership: 'incoming' }])).toEqual({ owned: 0, incoming: 1 })
    expect(ownedForWish(item, [{ ...card, variant: 'reverse', ownership: 'sold', status: 'sold' }])).toEqual({ owned: 0, incoming: 0 })
  })
})

describe('setvoortgang in drie delen', () => {
  const withTg = [...cards, { id: 's-TG01', localId: 'TG01' }]
  const map = new Map(variants).set('s-TG01', ['holo'])
  it('officieel, extra (hoger nummer en TG) en master per uitvoering', () => {
    const owned = [copy('s-1', 'normal'), copy('s-1', 'reverse'), copy('s-3', 'holo'), copy('s-TG01', 'holo')]
    const p = splitProgress(withTg, map, owned, DEFAULT_GOAL, 3)
    expect(p.official).toEqual({ done: 2, total: 3 })
    expect(p.extra).toEqual({ done: 1, total: 2 })
    // Master: s-1 normal+reverse, s-2 normal+reverse, s-3 holo, s-4 holo, TG01 holo = 7 vakjes.
    expect(p.master).toEqual({ done: 4, total: 7 })
  })
  it('zonder uitvoeringen geen master; zonder officiële telling alles officieel', () => {
    const p = splitProgress(withTg, null, [], DEFAULT_GOAL, null)
    expect(p.master).toBeNull()
    expect(p.official.total).toBe(5)
    expect(p.extra.total).toBe(0)
  })
  it('taal uit het doel telt mee', () => {
    const p = splitProgress(cards, null, [copy('s-1', 'normal', { language: 'ja' })], { ...DEFAULT_GOAL, languages: ['en'] }, 3)
    expect(p.official.done).toBe(0)
  })
})
