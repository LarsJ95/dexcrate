import { describe, expect, it } from 'vitest'
import { isNight, pickRunner, seedRunnerForPreview, speciesName, spriteUrls } from './runner'

describe('speciesName', () => {
  it('haalt kaarttype-achtervoegsels weg', () => {
    expect(speciesName('Mew ex')).toBe('Mew')
    expect(speciesName('Charizard VMAX')).toBe('Charizard')
    expect(speciesName('Pikachu')).toBe('Pikachu')
  })
})

describe('isNight', () => {
  it('is avond van 20 tot 6 uur', () => {
    expect(isNight(new Date(2026, 9, 15, 21))).toBe(true)
    expect(isNight(new Date(2026, 9, 15, 5))).toBe(true)
    expect(isNight(new Date(2026, 9, 15, 12))).toBe(false)
  })
})

describe('pickRunner', () => {
  it("laat 's nachts Ghost- en Darkness-Pokémon zwaarder wegen", () => {
    seedRunnerForPreview(
      [
        { dexId: 25, name: 'Pikachu', type: 'Lightning' },
        { dexId: 94, name: 'Gengar', type: 'Psychic' },
      ],
      0,
    )
    // Gewichten 's nachts: Pikachu 1, Gengar 4 → 0,25 valt bij Gengar.
    expect(pickRunner(true, () => 0.25)?.name).toBe('Gengar')
    // Overdag 1 en 1 → 0,25 valt bij Pikachu.
    expect(pickRunner(false, () => 0.25)?.name).toBe('Pikachu')
  })
})

describe('spriteUrls', () => {
  it('probeert eerst de bewegende sprite, dan de stilstaande', () => {
    const [anim, still] = spriteUrls(6, true)
    expect(anim).toMatch(/animated\/shiny\/6\.gif$/)
    expect(still).toMatch(/pokemon\/shiny\/6\.png$/)
  })
})
