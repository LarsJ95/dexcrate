// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readScrollMemory, useSavedScroll, useScrollMemory, writeScrollMemory } from './useScrollMemory'

const scrollTo = vi.fn((opts: ScrollToOptions) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: opts.top ?? 0 })
})

beforeEach(() => {
  sessionStorage.clear()
  scrollTo.mockClear()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})
afterEach(() => vi.useRealTimers())

describe('readScrollMemory', () => {
  it('na 30 minuten vergeten; onleesbaar = niets', () => {
    writeScrollMemory('x', { y: 900, count: 96, at: 1_000 })
    expect(readScrollMemory('x', 1_000 + 29 * 60_000)).toEqual({ y: 900, count: 96, at: 1_000 })
    expect(readScrollMemory('x', 1_000 + 31 * 60_000)).toBe(null)
    sessionStorage.setItem('dexcrate:scroll:x', '{kapot')
    expect(readScrollMemory('x')).toBe(null)
  })
})

describe('useScrollMemory', () => {
  it('bij verlaten: laatste scrollpositie en aantal bewaard', () => {
    const { unmount } = renderHook(() => useScrollMemory('collection', null, true, 144))
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 2400 })
    window.dispatchEvent(new Event('scroll'))
    unmount()
    expect(readScrollMemory('collection')).toMatchObject({ y: 2400, count: 144 })
  })

  it('terugkomen: pas terugscrollen als de lijst er staat', async () => {
    writeScrollMemory('collection', { y: 2400, count: 144, at: Date.now() })
    const { rerender } = renderHook(({ ready }) => useScrollMemory('collection', useSavedScroll('collection'), ready, 144), { initialProps: { ready: false } })
    await new Promise((r) => requestAnimationFrame(r))
    expect(scrollTo).not.toHaveBeenCalled()
    rerender({ ready: true })
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 2400 }))
  })
})
