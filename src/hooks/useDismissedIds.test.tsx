// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDismissedIds } from './useDismissedIds'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useDismissedIds', () => {
  it('weggeklikt blijft weg na herladen, tot er een nieuw id bij komt', () => {
    const first = renderHook(() => useDismissedIds('test:notice'))
    expect(first.result.current.hasNew(['a'])).toBe(true)
    act(() => first.result.current.dismiss(['a', 'b']))
    expect(first.result.current.hasNew(['a', 'b'])).toBe(false)
    first.unmount()
    const again = renderHook(() => useDismissedIds('test:notice'))
    expect(again.result.current.hasNew(['b'])).toBe(false)
    expect(again.result.current.hasNew(['a', 'c'])).toBe(true)
  })
})
