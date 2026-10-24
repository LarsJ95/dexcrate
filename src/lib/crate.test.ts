import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { GREAT_SLOT, HIT_SLOT, MISSING_FIRST, OLD_RULES, packStep, RARE_SLOT, canAfford, craftClassOf, craftCost, crateSetProgress, packCost, packSlots, packsByCost, pickSetCard, setPackSlots, toRules, tradeValue } = await import('./crate')

describe('Crate-pakje', () => {
  it('kansen per vak tellen op tot 1', () => {
    for (const odds of [RARE_SLOT, GREAT_SLOT, HIT_SLOT]) expect(odds.reduce((n, s) => n + s.weight, 0)).toBeCloseTo(1)
  })
  it('booster: 6 common, 3 uncommon en een rare-vak volgens de kans', () => {
    const slots = packSlots('booster', () => 0.01)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(6)
    expect(slots.filter((s) => s === 'Uncommon')).toHaveLength(3)
    expect(slots[9]).toBe('Rare')
    expect(packSlots('booster', () => 0.999)[9]).toBe('Hyper rare')
    expect(packSlots('booster', () => 0.6)[9]).toBe('Rare Holo')
  })
  it('great: 5 common, 3 uncommon, 2 rare-vakken', () => {
    const slots = packSlots('great', () => 0.999)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(5)
    expect(slots.slice(8)).toEqual(['Hyper rare', 'Hyper rare'])
  })
  it('master: geen commons, 2 hits van minstens Double rare', () => {
    const slots = packSlots('master', () => 0.01)
    expect(slots).toHaveLength(10)
    expect(slots).not.toContain('Common')
    expect(slots.slice(8)).toEqual(['Double rare', 'Double rare'])
  })
  it('kosten en gratis booster (oude regels, zonder STAP18)', () => {
    expect(packCost(OLD_RULES, 'master')).toBe(1000)
    expect(packCost(OLD_RULES, 'set')).toBeNull()
    expect(canAfford(OLD_RULES, 'booster', 0, true)).toBe(true)
    expect(canAfford(OLD_RULES, 'great', 0, true)).toBe(false)
    expect(canAfford(OLD_RULES, 'great', 300, false)).toBe(true)
    expect(canAfford(OLD_RULES, 'set', 9999, false)).toBe(false)
  })
  it('regels uit de database (STAP18), kapot antwoord = oude regels', () => {
    const rules = toRules({ daily: 100, trade_factor: 2, crate_set: 500, packs: { booster: 100, great: 300, master: 1000, set: 200, type: 300 } })
    // Type pack is weggehaald (24-10-2026): zijn prijs in de database wordt genegeerd.
    expect(rules).toEqual({ daily: 100, tradeFactor: 2, crateSet: 500, packs: { booster: 100, great: 300, master: 1000, set: 200 }, craft: {} })
    expect(canAfford(rules, 'set', 200, false)).toBe(true)
    expect(toRules(null)).toBe(OLD_RULES)
    expect(toRules({ packs: { set: -5, booster: 'x' } }).packs).toEqual({})
  })
  it('gericht kopen (STAP22/23): prijs per klasse zoals de database', () => {
    const rules = toRules({ packs: {}, craft: { common: 40, uncommon: 60, rare: 100, double: 200, illustration: 300, special: 600, bogus: 1 } })
    expect(rules.craft).toEqual({ common: 40, uncommon: 60, rare: 100, double: 200, illustration: 300, special: 600 })
    expect(craftCost(rules, 'Common')).toBe(40)
    expect(craftCost(rules, 'Holo Rare')).toBe(100)
    expect(craftCost(rules, 'Ultra Rare')).toBe(200)
    expect(craftCost(rules, 'Illustration rare')).toBe(300)
    expect(craftCost(rules, 'Hyper rare')).toBe(600)
    expect(craftCost(rules, 'Secret Rare')).toBe(600)
    expect(craftCost(rules, null)).toBeNull()
    expect(craftClassOf('Promo')).toBeNull()
    expect(craftCost(OLD_RULES, 'Common')).toBeNull()
  })
  it('inruilwaarde volgens zeldzaamheid, met factor', () => {
    expect(tradeValue('Hyper rare')).toBe(30)
    expect(tradeValue('Rare Holo')).toBe(5)
    expect(tradeValue('Uncommon')).toBe(3)
    expect(tradeValue(null)).toBe(2)
    expect(tradeValue('Hyper rare', 2)).toBe(60)
  })
  it('set pack: alleen zeldzaamheden die de set heeft', () => {
    const rarities = ['Common', 'Uncommon', 'Rare', 'Double rare', 'ACE SPEC Rare']
    const slots = setPackSlots(rarities, () => 0.999)
    expect(slots).toHaveLength(10)
    expect(slots.filter((s) => s === 'Common')).toHaveLength(5)
    expect(slots.filter((s) => s === 'Uncommon')).toHaveLength(3)
    for (const s of slots.slice(8)) expect(['Rare', 'Double rare', 'ACE SPEC Rare']).toContain(s)
    expect(setPackSlots(rarities, () => 0.01).slice(8)).toEqual(['Rare', 'Rare'])
    // Set zonder uncommons (bv. 30th Celebration): die vakken worden common, niet rare.
    expect(setPackSlots(['Common', 'Rare', 'Illustration rare'], () => 0.5).slice(0, 8)).toEqual(Array(8).fill('Common'))
    // Promoset zonder common/uncommon: elk vak uit wat er is.
    expect(new Set(setPackSlots(['Promo'], () => 0.5))).toEqual(new Set(['Promo']))
  })
  it('voortgang van een set in de Crate: alleen nummers 1..official', () => {
    const cards = ['en/sv03.5-001', 'en/sv03.5-002', 'en/sv03.5-200', 'en/sv03.5-TG01', 'en/sv03-001'].map((tcgdexId) => ({ tcgdexId }))
    expect(crateSetProgress(cards, 'en/sv03.5', 165)).toBe(2)
  })
  it('set pack: met kans MISSING_FIRST een kaart die je nog mist', () => {
    const list = [{ id: 's-001' }, { id: 's-002' }, { id: 's-003' }]
    const have = new Set(['en/s-001', 'en/s-002'])
    // Onder de grens: uit de ontbrekende (alleen s-003).
    expect(pickSetCard(list, have, () => MISSING_FIRST - 0.01)?.id).toBe('s-003')
    // Erboven: willekeurig uit alle kaarten (0.99 → de laatste).
    expect(pickSetCard(list, have, () => 0.99)?.id).toBe('s-003')
    expect(pickSetCard(list, have, (() => { const r = [0.9, 0.1]; return () => r.shift() ?? 0 })())?.id).toBe('s-001')
    // Alles al binnen: gewoon willekeurig.
    expect(pickSetCard(list, new Set(list.map((c) => `en/${c.id}`)), () => 0.1)?.id).toBe('s-001')
  })
  it('pakjes van goedkoop naar duur; gelijke prijs in vaste volgorde, zonder prijs achteraan', () => {
    const rules = toRules({ daily: 150, trade_factor: 2, crate_set: 500, packs: { booster: 100, great: 300, master: 1000, set: 150, type: 300 } })
    expect(packsByCost(rules)).toEqual(['booster', 'set', 'great', 'master', 'lucky', 'daily'])
    expect(packsByCost(OLD_RULES)).toEqual(['booster', 'great', 'master', 'set', 'lucky', 'daily'])
  })
  it('STAP26: Lucky en Pakje van de dag met hun prijs; weggehaalde pakjes (Type, Pokémon, Era) genegeerd', () => {
    const rules = toRules({ packs: { booster: 100, great: 200, master: 1000, set: 150, type: 300, lucky: 150, pokemon: 250, era: 200, daily: 200 } })
    expect(packsByCost(rules)).toEqual(['booster', 'set', 'lucky', 'great', 'daily', 'master'])
    expect(Object.keys(rules.packs)).not.toContain('pokemon')
    expect(canAfford(rules, 'lucky', 150, false)).toBe(true)
    expect(packStep('daily')).toBe('STAP26')
    expect(packStep('set')).toBe('STAP18')
  })
})
