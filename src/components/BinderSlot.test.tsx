// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequirementState } from '../lib/goals'
import type { Cost } from '../lib/setBinder'
import type { Variant } from '../lib/types'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { BinderSlot } = await import('./BinderSlot')

afterEach(cleanup)

const card = { id: 'sv03.5-025', localId: '025', name: 'Pikachu', image: null }
const state = (variant: Variant | null, missing: number): RequirementState => ({
  req: { cardId: card.id, variant, variantsUnknown: false },
  have: missing === 0 ? 1 : 0,
  ordered: 0,
  missing,
  extra: 0,
})
const cost = (prices: [string, number | null][]): Cost => ({ done: prices.length, total: prices.length, prices: new Map(prices), running: false })

// Taal 'xx' bestaat niet in de catalogus: het vak toont de getekende voorkant (geen netwerk).
const base = { card, lang: 'xx', setId: 'sv03.5', qty: undefined, cost: null, sort: 'number' as const, values: null, newIndex: null, onOpen: () => {} }

describe('BinderSlot', () => {
  it('ontbrekende kaart: label, uitvoeringen en prijs van wat ontbreekt', () => {
    const states = [state('holo', 0), state('reverse', 2)]
    render(<BinderSlot {...base} states={states} cost={cost([[`${card.id}|reverse`, 1.25]])} />)
    expect(screen.getByRole('button', { name: 'View Pikachu #025 (missing)' })).toBeTruthy()
    expect(screen.getByTitle('Holo: owned').textContent).toBe('H')
    expect(screen.getByTitle('Reverse holo: missing').textContent).toBe('R')
    expect(screen.getByText('€2.50')).toBeTruthy()
  })

  it('onbekende prijs: "no price"; nog niet opgehaald: geen prijs', () => {
    const { rerender } = render(<BinderSlot {...base} states={[state(null, 1)]} cost={cost([[`${card.id}|any`, null]])} />)
    expect(screen.getByText('no price')).toBeTruthy()
    rerender(<BinderSlot {...base} states={[state(null, 1)]} cost={cost([])} />)
    expect(screen.queryByText('no price')).toBeNull()
  })

  it('complete kaart: geen prijs, wel aantal', () => {
    const { container } = render(<BinderSlot {...base} states={[state(null, 0)]} qty={3} cost={cost([])} />)
    expect(container.querySelector('li')?.className).toBe('slot have')
    expect(screen.getByText('3×')).toBeTruthy()
  })

  it('buiten het doel en nieuw; tikken opent de kaart', async () => {
    const onOpen = vi.fn()
    const { container } = render(<BinderSlot {...base} states={[]} newIndex={2} onOpen={onOpen} />)
    const li = container.querySelector('li')
    expect(li?.className).toBe('slot missing outside is-new')
    expect(li?.style.getPropertyValue('--pop-delay')).toBe('240ms')
    await userEvent.click(screen.getByRole('button', { name: 'View Pikachu #025 (not in goal)' }))
    expect(onOpen).toHaveBeenCalledWith(card)
  })

  it('sorteren op waarde toont de marktwaarde van de kaart', () => {
    render(<BinderSlot {...base} states={[state(null, 0)]} sort="value" values={{ prices: new Map([[card.id, 4]]) }} />)
    expect(screen.getByText('€4.00')).toBeTruthy()
  })
})
