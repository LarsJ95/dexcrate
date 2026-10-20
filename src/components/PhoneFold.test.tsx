// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhoneFold } from './PhoneFold'

function screenWidth(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query.includes('max-width: 480px'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderFold = () =>
  render(
    <PhoneFold id="test" title="Sales" summary="+€12.00 net">
      <p>Sold 3 cards</p>
    </PhoneFold>,
  )

describe('PhoneFold (O1)', () => {
  it('telefoon: eerst dicht met titel en samenvatting; tikken opent en wordt onthouden', async () => {
    screenWidth(true)
    renderFold()
    expect(screen.queryByText('Sold 3 cards')).toBe(null)
    const head = screen.getByRole('button', { name: /Sales/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('+€12.00 net')).toBeTruthy()
    await userEvent.click(head)
    expect(screen.getByText('Sold 3 cards')).toBeTruthy()
    cleanup()
    renderFold()
    expect(screen.getByText('Sold 3 cards')).toBeTruthy()
  })

  it('groter scherm: gewoon de inhoud, geen kop', () => {
    screenWidth(false)
    renderFold()
    expect(screen.getByText('Sold 3 cards')).toBeTruthy()
    expect(screen.queryByRole('button')).toBe(null)
  })
})
