// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setPartnerChoice } from '../lib/partner'
import { StartGuide } from './StartGuide'

const KEY = 'dexcrate:start-guide'

beforeEach(() => {
  localStorage.clear()
  setPartnerChoice(null)
})
afterEach(cleanup)

describe('StartGuide', () => {
  it('nieuw toestel zonder kaarten: startkaart, partner kiezen vinkt stap 1 af', () => {
    render(<StartGuide hasCards={false} fallback={<p>Leeg</p>} />)
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeTruthy()
    expect(screen.queryByText('Leeg')).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('open')
    expect(screen.getByRole('link', { name: /Scan cards/ }).getAttribute('href')).toBe('#/scan')
    expect(screen.getByRole('link', { name: 'Import a spreadsheet' }).getAttribute('href')).toBe('#/import')

    fireEvent.click(screen.getByRole('button', { name: 'Charmander' }))
    expect(screen.getByRole('button', { name: 'Charmander' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Charmander walks along with you through the app.')).toBeTruthy()
    expect(screen.getAllByText('Done:')).toHaveLength(1)
  })

  it('bestaande gebruiker met kaarten: geen startkaart, niets onthouden', () => {
    render(<StartGuide hasCards fallback={<p>Leeg</p>} />)
    expect(screen.queryByRole('heading', { name: 'Get started' })).toBeNull()
    expect(screen.getByText('Leeg')).toBeTruthy()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('eerste kaart binnen en partner gekozen: alles af, Close sluit hem voorgoed', () => {
    localStorage.setItem(KEY, 'open')
    act(() => setPartnerChoice({ dex: 25, name: 'Pikachu' }))
    render(<StartGuide hasCards />)
    expect(screen.getByRole('heading', { name: 'You’re all set!' })).toBeTruthy()
    expect(screen.getAllByText('Done:')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: /Scan cards/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('heading', { name: 'You’re all set!' })).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('done')
  })

  it('wegklikken (×): daarna de gewone lege pagina', () => {
    render(<StartGuide hasCards={false} fallback={<p>Leeg</p>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide getting started' }))
    expect(screen.getByText('Leeg')).toBeTruthy()
    expect(localStorage.getItem(KEY)).toBe('done')
  })
})
