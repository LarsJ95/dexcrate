import { describe, expect, it } from 'vitest'
import { FLYERS, fallingHead, hitsFallingStar, makeFallingStar, makeStars, pickFlyer, skyPhase, starStrength, twinkle } from './sky'

const at = (h: number): Date => new Date(2026, 9, 16, h, 30)
const seq = (...values: number[]): (() => number) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('hemel', () => {
  it('fase volgens het uur', () => {
    expect([4, 5, 7, 8, 17, 18, 20, 21, 23].map((h) => skyPhase(at(h)))).toEqual(['night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night'])
  })

  it('sterren: donker thema altijd, licht thema alleen een beetje bij nacht', () => {
    expect(starStrength('night', 'dark')).toBe(1)
    expect(starStrength('day', 'dark')).toBeGreaterThan(0)
    expect(starStrength('day', 'light')).toBe(0)
    expect(starStrength('night', 'light')).toBeGreaterThan(0)
  })

  it('aantal sterren volgt de schermgrootte, met een maximum', () => {
    expect(makeStars(390, 844)).toHaveLength(37)
    expect(makeStars(3440, 1440)).toHaveLength(550)
    expect(makeStars(8000, 4000)).toHaveLength(600)
  })

  it('twinkelen blijft tussen 0 en 1', () => {
    const [s] = makeStars(100, 100, seq(0.5))
    for (let t = 0; t < 10; t += 0.7) {
      expect(twinkle(s, t)).toBeGreaterThanOrEqual(0)
      expect(twinkle(s, t)).toBeLessThanOrEqual(1)
    }
  })

  it('vallende ster: kop beweegt, raken langs de staart, na afloop korte coulance', () => {
    const f = makeFallingStar(1000, 800, 0, seq(0.5))
    expect(fallingHead(f, -1)).toBeNull()
    const mid = fallingHead(f, 1100)
    expect(mid).not.toBeNull()
    expect(mid!.x).toBeLessThan(f.x0)
    expect(mid!.y).toBeGreaterThan(f.y0)
    expect(hitsFallingStar(f, mid!.x + 10, mid!.y - 10, 1100)).toBe(true)
    expect(hitsFallingStar(f, f.x0, f.y0, 1100)).toBe(true)
    expect(hitsFallingStar(f, mid!.x + 400, mid!.y, 1100)).toBe(false)
    expect(hitsFallingStar(f, f.x0, f.y0, f.duration + 300)).toBe(true)
    expect(hitsFallingStar(f, f.x0, f.y0, f.duration + 900)).toBe(false)
  })

  it('vliegende Pokémon: liefst uit je eigen collectie', () => {
    expect(pickFlyer([6, 25], seq(0.1, 0.0))).toBe(6)
    expect(FLYERS).toContain(pickFlyer([], seq(0.1, 0.99)))
  })
})
