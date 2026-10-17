// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStoredChoice } from './useStoredChoice'

type Sort = 'newest' | 'name' | 'rarity'
const SORTS: readonly Sort[] = ['newest', 'name', 'rarity']

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useStoredChoice', () => {
  it('begint met de standaard en onthoudt een nieuwe keuze', () => {
    const first = renderHook(() => useStoredChoice<Sort>('test:sort', SORTS, 'newest'))
    expect(first.result.current[0]).toBe('newest')
    act(() => first.result.current[1]('rarity'))
    expect(first.result.current[0]).toBe('rarity')
    first.unmount()
    // Opnieuw openen (zoals na herladen): de bewaarde keuze.
    const again = renderHook(() => useStoredChoice<Sort>('test:sort', SORTS, 'newest'))
    expect(again.result.current[0]).toBe('rarity')
  })

  it('negeert een onbekende of oude waarde', () => {
    localStorage.setItem('test:sort', 'priceDesc')
    const { result } = renderHook(() => useStoredChoice<Sort>('test:sort', SORTS, 'newest'))
    expect(result.current[0]).toBe('newest')
  })
})
