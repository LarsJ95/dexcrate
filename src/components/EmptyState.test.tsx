// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('lege pagina: kop, uitleg en één knop', () => {
    render(
      <EmptyState title="Start your collection" action={<a href="#/scan">Scan cards</a>}>
        Scan your cards.
      </EmptyState>,
    )
    expect(screen.getByRole('heading', { name: 'Start your collection' })).toBeTruthy()
    expect(screen.getByText('Scan your cards.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Scan cards' }).getAttribute('href')).toBe('#/scan')
  })

  it('zonder kop: compacte melding (filter levert niets op)', () => {
    const { container } = render(<EmptyState>No cards match these filters.</EmptyState>)
    expect(container.firstElementChild?.className).toBe('empty empty-state is-compact')
    expect(screen.queryByRole('heading')).toBeNull()
  })
})
