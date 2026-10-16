import { describe, expect, it } from 'vitest'
import { limitlessEnCardUrl, ptcgCardUrl } from './cardImages'

describe('extra kaartfoto-bronnen', () => {
  it('Limitless: drie cijfers, rare tekens geweigerd, afwijkende nummering overgeslagen', () => {
    expect(limitlessEnCardUrl('SVP', 'svp', '196', 'low')).toBe('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_196_R_EN_SM.png')
    expect(limitlessEnCardUrl('MEP', 'mep', '23', 'high')).toBe('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_023_R_EN_LG.png')
    expect(limitlessEnCardUrl('30C', '30th-c', '001', 'low')).toBeNull()
    expect(limitlessEnCardUrl('CRZ:GG', 'swsh12.5gg', 'GG01', 'low')).toBeNull()
    expect(limitlessEnCardUrl(null, 'svp', '1', 'low')).toBeNull()
    expect(limitlessEnCardUrl('SVP', 'svp', '../1', 'low')).toBeNull()
  })

  it('pokemontcg.io: zonder voorloopnullen, letters blijven', () => {
    expect(ptcgCardUrl('sm75', 'sm7.5', '003', 'low')).toBe('https://images.pokemontcg.io/sm75/3.png')
    expect(ptcgCardUrl('swsh9tg', 'swsh9tg', 'TG01', 'high')).toBe('https://images.pokemontcg.io/swsh9tg/TG01_hires.png')
    expect(ptcgCardUrl(null, 'x', '1', 'low')).toBeNull()
    expect(ptcgCardUrl('me55c', '30th-c', '1', 'low')).toBeNull()
  })
})
