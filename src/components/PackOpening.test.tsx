// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackPull } from '../lib/crate'

const motion = vi.hoisted(() => ({ on: true }))
const trade = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ supabase: {} }))
// Beweging per test aan/uit; vonken en trillen (motionAllowed) altijd uit, jsdom heeft geen canvas.
vi.mock('../lib/motion', () => ({ useMotion: () => motion.on, motionAllowed: () => false }))
vi.mock('../hooks/useWishlistEnabled', () => ({ useWishlistEnabled: () => false }))
vi.mock('../lib/tcgdex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tcgdex')>()),
  getCardPrice: async () => null,
  getSetList: async () => new Map([['sv08', { id: 'sv08', name: 'Surging Sparks', official: 191 }]]),
}))
vi.mock('../lib/crate', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/crate')>()), tradeCrateCard: trade }))

const { PackOpening } = await import('./PackOpening')
const { tradeValue } = await import('../lib/crate')

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

const pull = (n: string, name: string, rarity: string): PackPull => ({ tcgdex_id: `en/sv08-${n}`, name, image: null, rarity, set_name: 'Surging Sparks' })
const PULLS = [pull('057', 'Pikachu ex', 'Double rare'), pull('001', 'Pineco', 'Common'), pull('002', 'Ledyba', 'Uncommon')]

/** Naam onder de kaart in beeld (de kaart zelf toont zonder foto ook de naam). */
const shown = (): string | null | undefined => document.querySelector('.pack-current-info strong')?.textContent

function open(): ReturnType<typeof render> {
  const view = render(
    <PackOpening pack="booster" pulls={PULLS} before={new Map([['en/sv08-001', 1]])} tradeFactor={1} onOpenAnother={null} opening={false} error={null} onPoints={vi.fn()} onClose={vi.fn()} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open your Booster pack' }))
  act(() => vi.advanceTimersByTime(650))
  return view
}

beforeEach(() => {
  motion.on = true
  trade.mockReset()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PackOpening: meer spel (24-10-2026)', () => {
  it('laatste kaart is een hit: eerst de achterkant, tikken draait hem om', async () => {
    open()
    expect(shown()).toBe('Pineco')
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(shown()).toBe('Ledyba')
    expect(screen.getByText('NEW')).toBeTruthy()
    // Officieel aantal uit de setlijst: "002/191".
    await act(async () => {})
    expect(screen.getByText('Surging Sparks · 002/191')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(shown()).toBe('Last card…')
    expect(screen.queryByText('Pikachu ex')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Last card. Turn it over' }))
    expect(shown()).toBe('Pikachu ex')
  })

  it('omdraaien gaat ook vanzelf; zonder animaties geen achterkant', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(screen.queryByText('Pikachu ex')).toBeNull()
    act(() => vi.advanceTimersByTime(1300))
    expect(shown()).toBe('Pikachu ex')
    cleanup()

    motion.on = false
    render(<PackOpening pack="booster" pulls={PULLS} before={new Map()} tradeFactor={1} onOpenAnother={null} opening={false} error={null} onPoints={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open your Booster pack' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(shown()).toBe('Pikachu ex')
    expect(document.querySelector('.pack-back')).toBeNull()
  })

  it('overzicht: Best pull, setvoortgang en "+N pts" na inruilen', async () => {
    trade.mockResolvedValue({ points: 700 })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await act(async () => {})
    expect(screen.getByText('Best pull').parentElement?.textContent).toContain('Pikachu ex')
    expect(screen.getByRole('button', { name: 'Pikachu ex, best pull' })).toBeTruthy()
    const sets = screen.getByRole('list', { name: 'Set progress' })
    const meter = within(sets).getByRole('meter')
    expect(meter.getAttribute('aria-valuenow')).toBe('3')
    expect(sets.textContent).toContain('1 → 3 / 191')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Trade in duplicates/ }))
    })
    expect(trade).toHaveBeenCalledWith('en/sv08-001', 1)
    expect(screen.getByRole('status').textContent).toBe(`+${tradeValue('Common', 1)} pts`)
  })
})
