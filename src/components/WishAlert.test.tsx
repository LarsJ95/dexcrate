// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WishAlert } from './WishAlert'

const KEY = 'dexcrate:wish-deals-seen'

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/overview'
})
afterEach(cleanup)

describe('WishAlert', () => {
  it('nieuwe deal: melding; tikken opent de Wishlist en onthoudt hem', () => {
    render(<WishAlert ids={['a', 'b']} route="overview" />)
    const open = screen.getByRole('button', { name: /2 wishlist cards are now within your max\. price/ })
    fireEvent.click(open)
    expect(window.location.hash).toBe('#/wishlist')
    expect(screen.queryByText(/A wild deal appeared/)).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('a|b')
  })

  it('al gezien: geen melding; een nieuwe deal erbij: weer wel', () => {
    localStorage.setItem(KEY, 'a|b')
    const { rerender } = render(<WishAlert ids={['a', 'b']} route="overview" />)
    expect(screen.queryByText(/A wild deal appeared/)).toBeNull()
    rerender(<WishAlert ids={['b']} route="overview" />)
    expect(screen.queryByText(/A wild deal appeared/)).toBeNull()
    rerender(<WishAlert ids={['b', 'c']} route="overview" />)
    expect(screen.getByText(/2 wishlist cards are/)).toBeTruthy()
  })

  it('wegklikken onthoudt alleen de huidige deals (gestegen en weer gezakt = opnieuw melden)', () => {
    localStorage.setItem(KEY, 'a|old')
    const { rerender } = render(<WishAlert ids={['a', 'b']} route="overview" />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(localStorage.getItem(KEY)).toBe('a|b')
    rerender(<WishAlert ids={['a', 'b', 'old']} route="overview" />)
    expect(screen.getByText(/3 wishlist cards are/)).toBeTruthy()
  })

  it('op de Wishlist zelf: geen melding, wel gezien', () => {
    render(<WishAlert ids={['a']} route="wishlist" />)
    expect(screen.queryByText(/A wild deal appeared/)).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('a')
  })

  it('geen deals: niets', () => {
    const { container } = render(<WishAlert ids={[]} route="overview" />)
    expect(container.innerHTML).toBe('')
  })
})
