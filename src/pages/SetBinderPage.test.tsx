// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardmarketPrice, SetCard } from '../lib/tcgdex'

// Paginatest: alle netwerk en zware onderdelen nagebootst; het gaat om pagina's, filters, sortering en bladeren.
const cards: SetCard[] = Array.from({ length: 10 }, (_, i) => ({ id: `tst-${i + 1}`, localId: String(i + 1), name: `Card ${String.fromCharCode(74 - i)}`, image: null }))
// Prijs per kaartnummer: kaart 3 duurst, kaart 7 zonder prijs.
const PRICES: Record<string, number | null> = { 'tst-3': 50, 'tst-1': 20, 'tst-7': null }
const RARITIES = new Map<string, string | null>(cards.map((c) => [c.id, c.id === 'tst-5' ? 'Special illustration rare' : c.id === 'tst-2' ? 'Double rare' : 'Common']))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/db', () => ({
  listCards: vi.fn(async () => [
    { id: 'm1', tcgdex_id: 'en/tst-2', status: 'collection', ownership: 'owned', quantity: 1, variant: null, language: 'en' },
    { id: 'm2', tcgdex_id: 'en/tst-4', status: 'collection', ownership: 'owned', quantity: 1, variant: null, language: 'en' },
  ]),
}))
vi.mock('../lib/tcgdex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/tcgdex')>()),
  getSet: vi.fn(async () => ({ summary: { id: 'tst', name: 'Test Set', logo: null, official: 10 }, cards })),
  getCardPrice: vi.fn(async (key: string): Promise<CardmarketPrice | null> => {
    const v = PRICES[key.slice(3)]
    return v == null ? null : ({ trend: v, avg30: v, idProduct: null } as unknown as CardmarketPrice)
  }),
  getCardInfo: vi.fn(async () => null),
}))
vi.mock('../lib/prices', () => ({ marketValue: (p: { trend: number } | null) => (p ? { value: p.trend } : null) }))
vi.mock('../hooks/useWishlistEnabled', () => ({ useWishlistEnabled: () => false }))
vi.mock('../hooks/useSetRarities', () => ({ useSetRarities: (_l: string, _s: string | null, enabled: boolean) => (enabled ? RARITIES : undefined) }))
vi.mock('../hooks/useCatalogInfos', () => ({ useCatalogInfos: () => new Map() }))
vi.mock('../lib/moments', () => ({ SET_MILESTONES: [], celebrateMilestone: () => {}, showMoment: () => {} }))
vi.mock('../lib/celebrate', () => ({ crateForSet: async () => {} }))
vi.mock('../lib/fx', () => ({ burstFrom: () => {} }))
vi.mock('../components/BinderSlot', () => ({
  BinderSlot: ({ card, qty, onOpen }: { card: SetCard; qty?: number; onOpen: (c: SetCard) => void }): JSX.Element => (
    <li>
      <button type="button" data-owned={qty ? 'yes' : 'no'} onClick={() => onOpen(card)}>
        {card.id}
      </button>
    </li>
  ),
}))
vi.mock('../components/SetCardSheet', () => ({
  SetCardSheet: ({ card, nav, onClose }: { card: SetCard; nav?: { position: number; total: number; onPrev: (() => void) | null; onNext: (() => void) | null }; onClose: () => void }): JSX.Element => (
    <div role="dialog" aria-label={card.id}>
      <p>
        {nav?.position} of {nav?.total}
      </p>
      <button type="button" disabled={!nav?.onPrev} onClick={() => nav?.onPrev?.()}>
        Previous
      </button>
      <button type="button" disabled={!nav?.onNext} onClick={() => nav?.onNext?.()}>
        Next
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}))

const { SetBinderPage } = await import('./SetBinderPage')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

/** Kaart-ids per binderpagina, zoals getoond. */
function pages(): string[][] {
  return screen.getAllByRole('region', { name: /^Page \d+$/ }).map((p) => within(p).getAllByRole('button').map((b) => b.textContent ?? ''))
}

async function renderPage(): Promise<void> {
  render(<SetBinderPage param="en/tst" />)
  await screen.findByRole('heading', { name: /Test Set/ })
}

describe('SetBinderPage', () => {
  it('toont de set in pagina’s van 9, of 6 als je dat kiest (en onthoudt dat)', async () => {
    await renderPage()
    expect(screen.getByText(/2 of 10 cards/)).toBeTruthy()
    expect(pages().map((p) => p.length)).toEqual([9, 1])
    await userEvent.click(screen.getByRole('button', { name: '6 per page' }))
    expect(pages().map((p) => p.length)).toEqual([6, 4])
    expect(localStorage.getItem('dexcrate:binder-page-size')).toBe('6')
  })

  it('Complete en Missing filteren op bezit', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    expect(pages().flat()).toEqual(['tst-2', 'tst-4'])
    await userEvent.click(screen.getByRole('button', { name: 'Missing' }))
    expect(pages().flat()).toHaveLength(8)
    expect(pages().flat()).not.toContain('tst-2')
  })

  it('sorteren houdt pagina’s van 9 en 6', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'numberDesc')
    expect(pages()[0][0]).toBe('tst-10')
    expect(pages().map((p) => p.length)).toEqual([9, 1])
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'name')
    // Namen lopen van J (kaart 1) naar A (kaart 10).
    expect(pages()[0][0]).toBe('tst-10')
    expect(pages()[1]).toEqual(['tst-1'])
  })

  it('op waarde: duurste eerst of goedkoopste eerst, zonder prijs achteraan', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'value')
    await waitFor(() => expect(pages()[0].slice(0, 2)).toEqual(['tst-3', 'tst-1']))
    expect(pages().flat().at(-1)).toBe('tst-10')
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'valueAsc')
    expect(pages()[0].slice(0, 2)).toEqual(['tst-1', 'tst-3'])
  })

  it('op zeldzaamheid: zeldzaamste eerst', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'rarity')
    expect(pages()[0].slice(0, 3)).toEqual(['tst-5', 'tst-2', 'tst-1'])
  })

  it('sortering begint bij elke set weer op nummer', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'name')
    cleanup()
    await renderPage()
    expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('number')
  })

  it('kaartvenster bladert in de getoonde volgorde', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'numberDesc')
    await userEvent.click(screen.getByRole('button', { name: 'tst-10' }))
    const sheet = screen.getByRole('dialog', { name: 'tst-10' })
    expect(within(sheet).getByText('1 of 10')).toBeTruthy()
    expect((within(sheet).getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'tst-9' })).toBeTruthy()
    expect(screen.getByText('2 of 10')).toBeTruthy()
  })

  it('onbekende set: melding met weg terug', async () => {
    render(<SetBinderPage param="xx/" />)
    expect(screen.getByText(/Invalid set/)).toBeTruthy()
  })
})
