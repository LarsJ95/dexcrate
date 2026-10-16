import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, SAMPLE_H, SAMPLE_W, createAutoCapture, normalize } from './autoCapture'

/** Kunstmatig meetbeeld: een 'kaart' is een patroon met veel randen, een lege tafel bijna vlak. */
function card(seed: number, shift = 0): Float32Array {
  const g = new Float32Array(SAMPLE_W * SAMPLE_H)
  for (let y = 0; y < SAMPLE_H; y++) {
    for (let x = 0; x < SAMPLE_W; x++) {
      const stripe = Math.floor((x + shift + seed * 3) / 4) % 2 === 0
      const band = Math.floor((y + seed * 5) / 6) % 2 === 0
      g[y * SAMPLE_W + x] = stripe !== band ? 220 : 40
    }
  }
  return g
}
const table = (): Float32Array => new Float32Array(SAMPLE_W * SAMPLE_H).map((_, i) => 110 + (i % 7))

function run(frames: Float32Array[]): string[] {
  const auto = createAutoCapture()
  // Gesimuleerde klok: één beeld per seconde, zodat de minimale wachttijd hier niet meespeelt.
  return frames.map((f, i) => {
    const r = auto.step(f, i * 1000)
    return r.capture ? 'FOTO' : r.hint
  })
}

describe('automatisch afdrukken', () => {
  it('foto pas na een paar stille tikken', () => {
    expect(run([card(1), card(1), card(1), card(1)])).toEqual(['hold', 'hold', 'hold', 'FOTO'])
  })

  it('lege tafel: geen foto', () => {
    expect(run([table(), table(), table(), table(), table()])).toEqual(['place', 'place', 'place', 'place', 'place'])
  })

  it('bewegen telt de stille tikken opnieuw', () => {
    expect(run([card(1), card(1, 2), card(1), card(1), card(1), card(1)])).toEqual(['hold', 'hold', 'hold', 'hold', 'hold', 'FOTO'])
  })

  it('zelfde kaart blijft liggen: één foto; daarna andere kaart: nieuwe foto', () => {
    const r = run([card(1), card(1), card(1), card(1), card(1), card(1), card(2), card(2), card(2), card(2)])
    expect(r.filter((x) => x === 'FOTO')).toHaveLength(2)
    expect(r.slice(4, 6)).toEqual(['swap', 'swap'])
  })

  it('kaart weg en dezelfde terug: geen tweede foto', () => {
    const r = run([card(1), card(1), card(1), card(1), table(), table(), card(1), card(1), card(1), card(1)])
    expect(r.filter((x) => x === 'FOTO')).toHaveLength(1)
  })

  it('helderheid verandert (camera past belichting aan): telt niet als ander beeld', () => {
    const darker = card(1).map((v) => v * 0.6 + 10)
    const r = run([card(1), card(1), card(1), card(1), darker, darker, darker, darker])
    expect(r.filter((x) => x === 'FOTO')).toHaveLength(1)
  })

  it('normaliseren: gemiddelde 0', () => {
    const n = normalize(card(1))
    expect(Math.abs(n.reduce((a, b) => a + b, 0) / n.length)).toBeLessThan(1e-6)
  })

  it("minimale tijd tussen twee foto's: te snel een andere kaart = eerst wachten", () => {
    const auto = createAutoCapture({ ...DEFAULT_TUNING, minGapMs: 2500 })
    const at = (f: Float32Array, t: number): string => {
      const r = auto.step(f, t)
      return r.capture ? 'FOTO' : r.hint
    }
    const first = [0, 200, 400, 600].map((t) => at(card(1), t))
    expect(first.at(-1)).toBe('FOTO')
    // Meteen een andere kaart, stil: binnen 2,5 s geen foto.
    const soon = [800, 1000, 1200, 1400, 2800].map((t) => at(card(2), t))
    expect(soon).not.toContain('FOTO')
    expect(soon.at(-1)).toBe('wait')
    // Na de wachttijd wel.
    expect(at(card(2), 3200)).toBe('FOTO')
  })
})
