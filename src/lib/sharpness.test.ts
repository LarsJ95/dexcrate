import { describe, expect, it } from 'vitest'
import { laplacianVariance, smooth3, toGray } from './sharpness'

const W = 40
const H = 40
/** Verticale rand: links zwart, rechts wit; `soft` = breedte van de overgang in pixels. */
function edge(soft: number): Float32Array {
  const g = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) g[y * W + x] = Math.max(0, Math.min(255, ((x - W / 2) / Math.max(1, soft) + 0.5) * 255))
  }
  return g
}

describe('scherpte', () => {
  it('vlak beeld = 0', () => {
    expect(laplacianVariance(new Float32Array(W * H).fill(128), W, H)).toBe(0)
  })

  it('scherpe rand scoort hoger dan een zachte', () => {
    const sharp = laplacianVariance(smooth3(edge(1), W, H), W, H)
    const soft = laplacianVariance(smooth3(edge(8), W, H), W, H)
    expect(sharp).toBeGreaterThan(soft * 5)
  })

  it('egaliseren dempt ruis veel meer dan randen', () => {
    const noise = new Float32Array(W * H).map((_, i) => ((i * 7919) % 23) - 11)
    const raw = laplacianVariance(noise, W, H)
    const smoothed = laplacianVariance(smooth3(noise, W, H), W, H)
    expect(smoothed).toBeLessThan(raw / 5)
  })

  it('grijswaarden uit RGBA', () => {
    expect([...toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)].map(Math.round)).toEqual([255, 0])
  })

  it('te klein beeld = 0', () => {
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0)
  })
})
