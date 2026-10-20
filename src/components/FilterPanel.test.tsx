// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterPanel } from './FilterPanel'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

/** Nagebootst scherm: telefoon (≤ 480 px) of groter. */
function screenWidth(phone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query.includes('max-width: 480px'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

beforeEach(() => screenWidth(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPanel(over: Partial<Parameters<typeof FilterPanel>[0]> = {}) {
  const props = {
    toolbar: <input aria-label="Search" />,
    activeCount: 2,
    canClear: true,
    onClear: vi.fn(),
    chips: [
      { key: 'language', label: 'Japanese', onRemove: vi.fn() },
      { key: 'variant', label: 'Holo', onRemove: vi.fn() },
    ],
    resultCount: 23,
    ...over,
  }
  render(
    <FilterPanel {...props}>
      <label>
        Language
        <select defaultValue="ja">
          <option value="">All</option>
          <option value="ja">Japanese</option>
        </select>
      </label>
    </FilterPanel>,
  )
  return props
}

describe('FilterPanel op de telefoon', () => {
  it('velden pas in het venster; chips met wegtikken; "Clear all" bij meer dan één', async () => {
    const props = renderPanel()
    expect(screen.queryByLabelText('Language')).toBe(null)
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Japanese' }))
    expect(props.chips[0].onRemove).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(props.onClear).toHaveBeenCalledOnce()
  })

  it('"Filters (2)" opent het venster; "Show 23 cards" sluit het en de keuzes blijven', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Filters (2)' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy()
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('ja')
    await userEvent.click(screen.getByRole('button', { name: 'Show 23 cards' }))
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('één resultaat en eigen naamwoord; aantal onbekend: "Show results"', async () => {
    renderPanel({ resultCount: 1, resultNoun: ['wish', 'wishes'], chips: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Filters (2)' }))
    expect(screen.getByRole('button', { name: 'Show 1 wish' })).toBeTruthy()
    cleanup()
    renderPanel({ resultCount: undefined })
    await userEvent.click(screen.getByRole('button', { name: 'Filters (2)' }))
    expect(screen.getByRole('button', { name: 'Show results' })).toBeTruthy()
  })
})

describe('FilterPanel op een groter scherm', () => {
  it('altijd open, geen knop en geen chips', () => {
    screenWidth(false)
    renderPanel()
    expect(screen.getByLabelText('Language')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Filters/ })).toBe(null)
    expect(screen.queryByRole('button', { name: /Remove filter/ })).toBe(null)
  })
})
