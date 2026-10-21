// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequirementState } from '../lib/goals'
import type { Cost } from '../lib/setBinder'
import type { Variant } from '../lib/types'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
// Met een echte taal ('en'): geen netwerk voor foto en prijs.
vi.mock('./CatalogCardPicture', () => ({ CatalogCardPicture: () => null }))
const priceCalls: (string | null)[] = []
vi.mock('../hooks/useCardPrice', () => ({
  useCardPrice: (key: string | null) => {
    priceCalls.push(key)
    if (!key) return null
    // Kaart 026 heeft ook een reverse holo.
    const rh = key.endsWith('-026') ? 6 : null
    return { trend: 2.5, avg30: 2.5, avg7: null, idProduct: null, trendHolo: rh, avg30Holo: rh, avg7Holo: null }
  },
}))

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

  it('tijdens selecteren: "Select …", ingedrukt-status en vinkje; tikken geeft de kaart door', async () => {
    const onOpen = vi.fn()
    const { container, rerender } = render(<BinderSlot {...base} states={[state(null, 1)]} selected={false} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: 'Select Pikachu #025 (missing)' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith(card)
    rerender(<BinderSlot {...base} states={[state(null, 1)]} selected onOpen={onOpen} />)
    expect(container.querySelector('li')?.className).toBe('slot missing is-selected')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.select-badge')).toBeTruthy()
    rerender(<BinderSlot {...base} states={[state(null, 1)]} onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'View Pikachu #025 (missing)' }).getAttribute('aria-pressed')).toBeNull()
  })

  it('sorteren op waarde toont de marktwaarde van de kaart', () => {
    render(<BinderSlot {...base} states={[state(null, 0)]} sort="value" values={{ prices: new Map([[card.id, 4]]) }} />)
    expect(screen.getByText('€4.00')).toBeTruthy()
  })

  it('anders onder elke kaart de Cardmarket-prijs (ook als je hem al hebt)', () => {
    priceCalls.length = 0
    const { container } = render(<BinderSlot {...base} lang="en" states={[state(null, 0)]} />)
    expect(container.querySelector('.slot-price')?.textContent).toBe('€2.50')
    expect(priceCalls).toContain('en/sv03.5-025')
  })

  it('bestaat er een reverse holo, dan staat die prijs eronder (RH)', () => {
    const { container } = render(<BinderSlot {...base} card={{ ...card, id: 'sv03.5-026', localId: '026' }} lang="en" states={[state(null, 0)]} />)
    expect(container.querySelector('.slot-price')?.textContent).toBe('€2.50RH €6.00')
    expect(container.querySelector('.price-rh abbr')?.getAttribute('title')).toBe('Reverse holo')
  })

  it('na "kosten berekenen" blijft de prijs van wat ontbreekt staan, niet de marktprijs', () => {
    render(<BinderSlot {...base} lang="en" states={[state(null, 2)]} cost={cost([[`${card.id}|any`, 1.1]])} />)
    expect(screen.getByText('€2.20')).toBeTruthy()
    expect(document.querySelectorAll('.slot-price')).toHaveLength(1)
  })
})
