// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const media = vi.hoisted(() => ({ touch: false }))
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => media.touch }))

const { ScrollJump } = await import('./ScrollJump')

/** jsdom heeft geen opmaak: paginahoogte en scrollpositie zelf zetten. */
function page(height: number, y: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: height })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
}

/** Scrollen en de meting (volgende frame) laten verwerken. */
async function scrolled(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
  })
}

/** requestAnimationFrame direct na de huidige taak (zoals in een browser nooit synchroon). */
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    queueMicrotask(() => cb(0))
    return 1
  })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  media.touch = false
})

describe('ScrollJump', () => {
  it('korte pagina: geen pijlen', async () => {
    page(1200, 0)
    const { container } = render(<ScrollJump />)
    await scrolled()
    expect(container.innerHTML).toBe('')
  })

  it('lange pagina bovenaan: alleen omlaag; halverwege beide; omhoog scrollt naar 0', async () => {
    page(5000, 0)
    render(<ScrollJump />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Scroll to bottom' })).toBeTruthy()

    page(5000, 2000)
    await scrolled()
    await userEvent.click(screen.getByRole('button', { name: 'Scroll to top' }))
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))

    page(5000, 4200)
    await scrolled()
    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).toBeNull()
  })

  it('telefoon: pas zichtbaar tijdens scrollen, 2 seconden later weer weg', async () => {
    vi.useFakeTimers()
    media.touch = true
    page(5000, 1000)
    const { container } = render(<ScrollJump />)
    await act(async () => {})
    const box = (): Element | null => container.querySelector('.scroll-jump')
    expect(box()?.classList.contains('is-shown')).toBe(false)
    await scrolled()
    expect(box()?.classList.contains('is-shown')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(box()?.classList.contains('is-shown')).toBe(false)
    vi.useRealTimers()
  })
})
