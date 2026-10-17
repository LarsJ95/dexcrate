// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

function Bomb({ error }: { error: Error | null }): JSX.Element {
  if (error) throw error
  return <p>All good</p>
}

/** Gooit een fout zolang de test dat wil; daarna gaat het goed. */
const flaky = { broken: true }
function Flaky(): JSX.Element {
  if (flaky.broken) throw new Error('Kapot')
  return <p>Recovered</p>
}

describe('ErrorBoundary', () => {
  it('toont de inhoud als er niets misgaat', () => {
    render(
      <ErrorBoundary>
        <Bomb error={null} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeTruthy()
  })

  it('toont een melding met de fout in plaats van een wit scherm', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb error={new Error('Cannot read card')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Cannot read card')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to Overview' })).toBeTruthy()
    log.mockRestore()
  })

  it('kan opnieuw proberen', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    flaky.broken = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Recovered')).toBeTruthy()
    log.mockRestore()
  })

  it('begint opnieuw bij een andere pagina (resetKey)', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary resetKey="collection">
        <Bomb error={new Error('Kapot')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(
      <ErrorBoundary resetKey="sets">
        <Bomb error={null} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeTruthy()
    log.mockRestore()
  })

  it('geeft bij een niet geladen paginabestand een eigen melding zonder "Try again"', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb error={new TypeError('Failed to fetch dynamically imported module: https://x/assets/ScanPage.js')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('This page could not be loaded')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    log.mockRestore()
  })
})
