// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_CARD_EVENT, clearPendingCard, pendingCard, requestOpenCard } from './openCard'

afterEach(() => {
  clearPendingCard()
  window.location.hash = ''
})

describe('requestOpenCard', () => {
  it('elders: naar My cards, de kaart staat klaar', () => {
    window.location.hash = '#/overview'
    requestOpenCard('c1')
    expect(window.location.hash).toBe('#/collection')
    expect(pendingCard()).toBe('c1')
  })

  it('al op My cards: seintje in plaats van navigeren', () => {
    window.location.hash = '#/collection'
    const heard = vi.fn()
    window.addEventListener(OPEN_CARD_EVENT, heard)
    requestOpenCard('c2')
    window.removeEventListener(OPEN_CARD_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(pendingCard()).toBe('c2')
  })
})
