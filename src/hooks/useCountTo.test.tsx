// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ on: true }))
vi.mock('../lib/motion', () => ({ useMotion: () => motion.on }))

const { useCountTo, useDelta } = await import('./useCountTo')

// Beeldjes met de hand: elke frame(t) roept de wachtende callbacks aan met tijd t.
let queue: FrameRequestCallback[] = []
const frame = (t: number): void => {
  const run = queue
  queue = []
  act(() => {
    for (const cb of run) cb(t)
  })
}

beforeEach(() => {
  motion.on = true
  queue = []
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useCountTo', () => {
  it('eerste getal meteen; een wijziging loopt in stappen naar de nieuwe waarde', () => {
    const { result, rerender } = renderHook(({ v }) => useCountTo(v, 700), { initialProps: { v: null as number | null } })
    expect(result.current).toBeNull()
    rerender({ v: 100 })
    expect(result.current).toBe(100)
    rerender({ v: 250 })
    expect(result.current).toBe(100)
    frame(1350)
    expect(result.current).toBeGreaterThan(100)
    expect(result.current).toBeLessThan(250)
    frame(1700)
    expect(result.current).toBe(250)
    expect(queue).toHaveLength(0)
  })

  it('omlaag (pakje gekocht) telt ook af', () => {
    const { result, rerender } = renderHook(({ v }) => useCountTo(v, 700), { initialProps: { v: 500 as number | null } })
    rerender({ v: 350 })
    frame(1350)
    expect(result.current).toBeLessThan(500)
    expect(result.current).toBeGreaterThan(350)
    frame(1700)
    expect(result.current).toBe(350)
  })

  it('verschil even zichtbaar: niet bij laden, wel bij + en −', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { result, rerender } = renderHook(({ v }) => useDelta(v), { initialProps: { v: null as number | null } })
      rerender({ v: 640 })
      expect(result.current).toBeNull()
      rerender({ v: 680 })
      expect(result.current).toMatchObject({ n: 40 })
      rerender({ v: 530 })
      expect(result.current).toMatchObject({ n: -150 })
      act(() => vi.advanceTimersByTime(1800))
      expect(result.current).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('zonder animaties: meteen de nieuwe waarde', () => {
    motion.on = false
    const { result, rerender } = renderHook(({ v }) => useCountTo(v), { initialProps: { v: 100 as number | null } })
    rerender({ v: 250 })
    expect(result.current).toBe(250)
    expect(queue).toHaveLength(0)
  })
})
