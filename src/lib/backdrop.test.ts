import { describe, expect, it } from 'vitest'
import { BACKDROPS, backdropForDay, energyMixTile } from './backdrop'

describe('achtergrond van de dag', () => {
  it('zelfde dag = zelfde achtergrond, ook om middernacht en laat op de avond', () => {
    expect(backdropForDay(new Date(2026, 9, 17, 0, 1))).toBe(backdropForDay(new Date(2026, 9, 17, 23, 59)))
  })

  it('vier dagen achter elkaar: elke achtergrond één keer, daarna weer van voren', () => {
    const days = [17, 18, 19, 20].map((d) => backdropForDay(new Date(2026, 9, d, 12)))
    expect([...days].sort()).toEqual([...BACKDROPS].sort())
    expect(backdropForDay(new Date(2026, 9, 21, 12))).toBe(days[0])
  })

  it('werkt over maand- en jaargrenzen en bij zomertijd', () => {
    expect(backdropForDay(new Date(2026, 11, 31, 12))).not.toBe(backdropForDay(new Date(2027, 0, 1, 12)))
    // Zomertijd eindigt 25-10-2026 (Europa): de dag ervoor en erna verschillen nog steeds.
    expect(backdropForDay(new Date(2026, 9, 25, 12))).not.toBe(backdropForDay(new Date(2026, 9, 26, 12)))
  })
})

describe('energie-mix', () => {
  it('tien symbolen in hun eigen kleur', () => {
    const svg = decodeURIComponent(energyMixTile(() => '#f0612f'))
    expect(svg.match(/<path /g)).toHaveLength(10)
    expect(svg).toContain("fill='#f0612f'")
  })

  it('onveilige of lege kleur: symbool weglaten in plaats van rommel in de SVG', () => {
    const svg = decodeURIComponent(energyMixTile((t) => (t === 'Fire' ? "red' onload='x" : t === 'Water' ? '' : '#3d8fe0')))
    expect(svg.match(/<path /g)).toHaveLength(8)
    expect(svg).not.toContain('onload')
  })
})
