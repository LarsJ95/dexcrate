// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REST_POSE, settled } from '../lib/holoMotion'

/** Touchscreen of muis nabootsen (vóór het laden van HoloCard is niet nodig: hij leest het bij het starten). */
function pointer(coarse: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('pointer: coarse'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

/** requestAnimationFrame met de hand: zo is te tellen hoeveel beeldjes er nog komen. */
let queue: FrameRequestCallback[] = []
function fakeFrames(): void {
  queue = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
}
function runFrames(n: number): number {
  let ran = 0
  for (let i = 0; i < n && queue.length > 0; i++) {
    const cb = queue.shift()
    cb?.(i * 16)
    ran++
  }
  return ran
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('settled', () => {
  it('stil als kanteling en glans (bijna) op het doel liggen', () => {
    expect(settled({ ...REST_POSE }, REST_POSE)).toBe(true)
    expect(settled({ ...REST_POSE, rx: 0.2 }, REST_POSE)).toBe(false)
  })
})

describe('HoloCard op een touchscreen', () => {
  it('geen zwaai in rust: geen beeldjes zonder aanraking; na loslaten tot stilstand en dan stoppen', async () => {
    pointer(true)
    fakeFrames()
    const { HoloCard } = await import('./HoloCard')
    const { container } = render(
      <HoloCard foil="holo" interactive>
        <span>kaart</span>
      </HoloCard>,
    )
    expect(queue.length).toBe(0)
    const card = container.querySelector('.holo-card') as HTMLElement
    card.setPointerCapture = vi.fn()
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(queue.length).toBe(1)
    fireEvent.pointerUp(card, { pointerId: 1 })
    // Loopt nog even door naar de rustpositie, dan geen nieuwe beeldjes meer.
    const ran = runFrames(2000)
    expect(ran).toBeLessThan(2000)
    expect(queue.length).toBe(0)
  })

  it('met een muis blijft de rustige zwaai', async () => {
    pointer(false)
    fakeFrames()
    const { HoloCard } = await import('./HoloCard')
    render(
      <HoloCard foil="holo">
        <span>kaart</span>
      </HoloCard>,
    )
    expect(runFrames(50)).toBe(50)
    expect(queue.length).toBe(1)
  })
})
