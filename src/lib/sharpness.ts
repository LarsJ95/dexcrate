/**
 * Scherptemeting voor scanfoto's: variantie van de Laplace-operator op grijswaarden.
 * Scherpe randen (tekst, kaartrand) geven een hoge waarde; een bewogen of onscherpe foto een lage.
 */

/** Meetbreedte: genoeg voor de tekst onderaan, snel genoeg voor elke foto. */
export const MEASURE_EDGE = 480

/**
 * Onder deze waarde noemen we een foto wazig. Gemeten op nagebootste telefoonfoto's (kaart op tafel, ruis):
 * scherp 140-250, licht onscherp 50-85, duidelijk wazig 20-40, erger < 15. Bewust aan de voorzichtige kant:
 * liever een twijfelfoto doorlaten (de herkenning meldt zelf onzekerheid) dan een goede foto weigeren.
 */
export const BLUR_THRESHOLD = 30

/** RGBA → grijswaarden (0-255). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  return out
}

/** 3×3-gemiddelde: haalt sensorruis weg (die anders als 'scherpte' telt), randen blijven. */
export function smooth3(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(gray.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          sum += gray[yy * width + xx]
          n += 1
        }
      }
      out[y * width + x] = sum / n
    }
  }
  return out
}

/** Variantie van de Laplace-respons (4-buren). 0 bij een vlak beeld. */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += v
      sumSq += v * v
      n += 1
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Scherpte van het midden van een foto (waar de kaart in het kader ligt). */
export async function photoSharpness(blob: Blob): Promise<number> {
  const bitmap = await createImageBitmap(blob)
  // Midden 70% × 80%: het camerakader; de achtergrond eromheen telt niet mee.
  const sw = bitmap.width * 0.7
  const sh = bitmap.height * 0.8
  const sx = (bitmap.width - sw) / 2
  const sy = (bitmap.height - sh) / 2
  const scale = Math.min(1, MEASURE_EDGE / Math.max(sw, sh))
  const w = Math.max(3, Math.round(sw * scale))
  const h = Math.max(3, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return Number.POSITIVE_INFINITY // niet te meten: niet tegenhouden
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, w, h)
  return laplacianVariance(smooth3(toGray(data, w, h), w, h), w, h)
}
