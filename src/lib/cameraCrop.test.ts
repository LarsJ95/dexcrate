import { describe, expect, it } from 'vitest'
import { frameToSource } from './cameraCrop'

describe('kader → camerabeeld', () => {
  it('zelfde verhouding: 1 op 1 geschaald', () => {
    // Scherm 400x800, video 800x1600 (schaal 0,5), kader in het midden 200x280.
    const box = frameToSource({ x: 0, y: 0, width: 400, height: 800 }, { x: 100, y: 260, width: 200, height: 280 }, { width: 800, height: 1600 }, 0)
    expect(box).toEqual({ x: 200, y: 520, width: 400, height: 560 })
  })

  it('cover: liggende video op staand scherm wordt links en rechts bijgesneden', () => {
    // Scherm 390x844, video 1920x1080: schaal 844/1080, breedte op scherm 1500 → 555 px links weggesneden.
    const box = frameToSource({ x: 0, y: 0, width: 390, height: 844 }, { x: 95, y: 280, width: 200, height: 280 }, { width: 1920, height: 1080 }, 0)
    const scale = 844 / 1080
    const cut = (1920 * scale - 390) / 2
    expect(box.x).toBe(Math.round((95 + cut) / scale))
    expect(box.width).toBe(Math.round((295 + cut) / scale) - box.x)
    expect(box.y).toBe(Math.round(280 / scale))
  })

  it('marge eromheen, maar nooit buiten het beeld', () => {
    const box = frameToSource({ x: 0, y: 0, width: 400, height: 800 }, { x: 0, y: 0, width: 400, height: 800 }, { width: 400, height: 800 })
    expect(box).toEqual({ x: 0, y: 0, width: 400, height: 800 })
    const inner = frameToSource({ x: 0, y: 0, width: 400, height: 800 }, { x: 100, y: 100, width: 100, height: 100 }, { width: 400, height: 800 })
    expect(inner).toEqual({ x: 88, y: 88, width: 124, height: 124 })
  })
})
