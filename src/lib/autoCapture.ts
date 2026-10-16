import { laplacianVariance, smooth3 } from './sharpness'

/**
 * Automatisch afdrukken bij snel scannen. Per tik een klein grijs beeld van het kader:
 * - stil? (weinig verschil met de vorige tik)
 * - ligt er een kaart? (genoeg detail: tekst en randen, een lege tafel heeft dat niet)
 * - is het een andere kaart dan de vorige foto? (duidelijk verschil met het laatst gefotografeerde beeld)
 * Pas als alles klopt, een paar tikken achter elkaar, volgt de foto. Daarna wachten tot het beeld verandert.
 * Vergelijkingen gebeuren op genormaliseerde beelden, zodat helderheidswisselingen van de camera niet tellen.
 */

/** Meetbeeld: klein genoeg voor elke 200 ms, groot genoeg voor tekst. */
export const SAMPLE_W = 72
export const SAMPLE_H = 100

export interface AutoTuning {
  /** Gemiddeld verschil (genormaliseerd) tussen twee tikken waaronder het beeld stil is. */
  still: number
  /** Verschil met de vorige foto waarboven het een ander beeld is. */
  changed: number
  /** Minimaal detail om als "kaart in beeld" te tellen. */
  detail: number
  /** Aantal stille tikken achter elkaar voor de foto. */
  stableTicks: number
}

/**
 * Gemeten met een nep-camera (videostroom, 72×100): kaarten 33-53 detail, lege tafel 0-1;
 * verschil tussen twee kaarten ±0,43, kaart vs. lege tafel ±1,0, lichte trilling 0,15-0,2.
 */
export const DEFAULT_TUNING: AutoTuning = { still: 0.12, changed: 0.3, detail: 15, stableTicks: 3 }

export type AutoHint = 'place' | 'hold' | 'swap' | 'capture'

/** z-score per beeld: gemiddelde 0, spreiding 1. */
export function normalize(gray: Float32Array): Float32Array {
  let sum = 0
  for (const v of gray) sum += v
  const mean = sum / gray.length
  let sq = 0
  for (const v of gray) sq += (v - mean) ** 2
  const sd = Math.sqrt(sq / gray.length) || 1
  return gray.map((v) => (v - mean) / sd)
}

export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i])
  return d / a.length
}

export interface AutoCapture {
  /** Eén tik met een grijs meetbeeld (SAMPLE_W × SAMPLE_H). */
  step(gray: Float32Array): { capture: boolean; hint: AutoHint }
  reset(): void
}

export function createAutoCapture(tuning: AutoTuning = DEFAULT_TUNING): AutoCapture {
  let prev: Float32Array | null = null
  let last: Float32Array | null = null
  let stable = 0
  let cooling = false

  return {
    reset() {
      prev = null
      last = null
      stable = 0
      cooling = false
    },
    step(gray) {
      const norm = normalize(gray)
      // Eerste tik: nog niets om mee te vergelijken, dus nog niet 'stil'.
      const still = prev !== null && meanAbsDiff(norm, prev) <= tuning.still
      prev = norm
      stable = still ? stable + 1 : 0
      const differs = last === null || meanAbsDiff(norm, last) > tuning.changed
      // Na een foto: wachten tot de kaart weg of verwisseld is.
      if (cooling) {
        if (!differs) return { capture: false, hint: 'swap' }
        cooling = false
      }
      const detail = laplacianVariance(smooth3(gray, SAMPLE_W, SAMPLE_H), SAMPLE_W, SAMPLE_H)
      if (detail < tuning.detail) return { capture: false, hint: 'place' }
      if (stable < tuning.stableTicks || !differs) return { capture: false, hint: 'hold' }
      last = norm
      cooling = true
      stable = 0
      return { capture: true, hint: 'capture' }
    },
  }
}
