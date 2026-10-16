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
  /** Minimale tijd tussen twee automatische foto's (ms), zodat je rustig naar de volgende kaart kunt. */
  minGapMs: number
}

/**
 * Gemeten op nagebootste camerabeelden (ruis, trillende hand), 72×100 na ruisfilter:
 * - stil: ruis 0,05, hand trilt 3-8 px 0,15-0,22; bewegen 20 px+ 0,36 → grens 0,25.
 * - andere kaart (grof beeld, 12×16): verschuiving tot 40 px 0,25-0,29, andere kaart 0,38, lege tafel 0,9 → grens 0,33.
 *   Sterk gelijkende kaarten (zelfde kleur en opmaak, ±0,13) ziet Auto als dezelfde: dan zelf afdrukken.
 * - detail: kaart ±50-130, lege tafel 0-4.
 */
export const DEFAULT_TUNING: AutoTuning = { still: 0.25, changed: 0.33, detail: 15, stableTicks: 3, minGapMs: 2500 }

export type AutoHint = 'place' | 'hold' | 'swap' | 'same' | 'wait' | 'capture'

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

/** Grof beeld (blokken van 6×6, genormaliseerd): kleine verschuivingen van de camera vallen weg. */
const BLOCK = 6
export function coarse(gray: Float32Array): Float32Array {
  const w = Math.floor(SAMPLE_W / BLOCK)
  const h = Math.floor(SAMPLE_H / BLOCK)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h * BLOCK; y++) {
    for (let x = 0; x < w * BLOCK; x++) out[Math.floor(y / BLOCK) * w + Math.floor(x / BLOCK)] += gray[y * SAMPLE_W + x] / (BLOCK * BLOCK)
  }
  return normalize(out)
}

export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i])
  return d / a.length
}

export interface AutoCapture {
  /** Eén tik met een grijs meetbeeld (SAMPLE_W × SAMPLE_H); `now` in ms. */
  step(gray: Float32Array, now?: number): { capture: boolean; hint: AutoHint }
  reset(): void
}

export function createAutoCapture(tuning: AutoTuning = DEFAULT_TUNING): AutoCapture {
  let prev: Float32Array | null = null
  let last: Float32Array | null = null
  /** Laatste tikken: stil of niet (nieuwste achteraan). */
  let recent: boolean[] = []
  let cooling = false
  let lastShot = Number.NEGATIVE_INFINITY

  return {
    reset() {
      prev = null
      last = null
      recent = []
      cooling = false
      lastShot = Number.NEGATIVE_INFINITY
    },
    step(gray, now = performance.now()) {
      // Eerst ruis wegfilteren: een camera in de hand ruist en trilt altijd een beetje.
      const smooth = smooth3(gray, SAMPLE_W, SAMPLE_H)
      const norm = normalize(smooth)
      // Eerste tik: nog niets om mee te vergelijken, dus nog niet 'stil'.
      const still = prev !== null && meanAbsDiff(norm, prev) <= tuning.still
      prev = norm
      recent = [...recent, still].slice(-tuning.stableTicks)
      const stableEnough = recent.length === tuning.stableTicks && recent.every(Boolean)
      const shape = coarse(smooth)
      const differs = last === null || meanAbsDiff(shape, last) > tuning.changed
      // Na een foto: wachten tot de kaart weg of verwisseld is.
      if (cooling) {
        if (!differs) return { capture: false, hint: 'swap' }
        cooling = false
      }
      const detail = laplacianVariance(smooth, SAMPLE_W, SAMPLE_H)
      if (detail < tuning.detail) return { capture: false, hint: 'place' }
      if (!stableEnough) return { capture: false, hint: 'hold' }
      if (!differs) return { capture: false, hint: 'same' }
      // Te kort na de vorige foto: eerst even wachten (je bent waarschijnlijk nog aan het wisselen).
      if (now - lastShot < tuning.minGapMs) return { capture: false, hint: 'wait' }
      lastShot = now
      last = shape
      cooling = true
      recent = []
      return { capture: true, hint: 'capture' }
    },
  }
}
