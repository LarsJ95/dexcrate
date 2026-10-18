import { describe, expect, it } from 'vitest'
import { speciesName, spriteUrls } from './runner'

describe('speciesName', () => {
  it('haalt kaarttype-achtervoegsels weg', () => {
    expect(speciesName('Mew ex')).toBe('Mew')
    expect(speciesName('Charizard VMAX')).toBe('Charizard')
    expect(speciesName('Pikachu')).toBe('Pikachu')
  })
})

describe('spriteUrls', () => {
  it('probeert eerst de bewegende sprite, dan de stilstaande', () => {
    const [anim, still] = spriteUrls(6, true)
    expect(anim).toMatch(/animated\/shiny\/6\.gif$/)
    expect(still).toMatch(/pokemon\/shiny\/6\.png$/)
  })
})
