// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WishlistInput } from '../lib/wishlist'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

const db = vi.hoisted(() => ({
  addWishlistItems: vi.fn(async (inputs: readonly WishlistInput[]) => inputs.map((input, i) => ({ ...input, id: `n${i + 1}`, created_at: '' }))),
  setListItems: vi.fn(async (_listId: string, _change: { add: readonly string[]; remove: readonly string[] }) => {}),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useDbFeature', () => ({ useDbFeature: () => true }))
// Alleen de eerste kaart heeft een bekend Cardmarket-product.
vi.mock('../hooks/useCardPrices', () => ({ useCardPrices: () => new Map([['en/sv03.5-001', { idProduct: 111 }]]) }))
vi.mock('../lib/wishlist', () => ({
  listWishlist: vi.fn(async () => [{ id: 'w-old', tcgdex_id: 'en/sv03.5-002', name: 'Ivysaur' }]),
  addWishlistItems: db.addWishlistItems,
}))
vi.mock('../lib/wishlistLists', () => ({
  hasManualLists: vi.fn(async () => true),
  listWishlistLists: vi.fn(async () => [
    { id: 'l1', name: 'Cheap deals', kind: 'smart', filters: {}, sort_order: 0 },
    { id: 'l3', name: 'Birthday', kind: 'manual', filters: {}, sort_order: 1 },
  ]),
  setListItems: db.setListItems,
}))

const { SetSelectionBar } = await import('./SetSelectionBar')

const cardsOf = (n: number): { id: string; localId: string; name: string; image: null }[] =>
  Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(3, '0')
    return { id: `sv03.5-${num}`, localId: num, name: `Card ${num}`, image: null }
  })

const base = { lang: 'en' as const, setCode: 'MEW', shownCount: 165, allShownSelected: false, onSelectAll: () => {}, onClear: () => {}, onDone: () => {}, wishlist: true }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  db.addWishlistItems.mockClear()
  db.setListItems.mockClear()
})

describe('SetSelectionBar: Cardmarket', () => {
  it('weinig kaarten: meteen openen; blokkeert de browser de rest, dan één voor één verder', async () => {
    const tab = (): Window => ({ opener: null }) as unknown as Window
    const open = vi.spyOn(window, 'open').mockImplementationOnce(tab).mockImplementationOnce(() => null)
    render(<SetSelectionBar {...base} selected={cardsOf(3)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open 3 on Cardmarket in new tabs' }))
    expect(open.mock.calls[0][0]).toContain('idProduct=111')
    expect(screen.getByText('1 of 3 tabs opened.')).toBeTruthy()

    open.mockImplementation(tab)
    await userEvent.click(screen.getByRole('button', { name: 'Open next (2 of 3)' }))
    expect(open.mock.lastCall?.[0]).toContain('searchString=Card%20002')
    await userEvent.click(screen.getByRole('button', { name: 'Open next (3 of 3)' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open).toHaveBeenCalledTimes(4)
  })

  it(`vanaf 10 kaarten eerst vragen`, async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({ opener: null }) as unknown as Window)
    render(<SetSelectionBar {...base} selected={cardsOf(10)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open 10 on Cardmarket in new tabs' }))
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByText('Open 10 Cardmarket pages, each in its own tab?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Open 10 tabs' }))
    expect(open).toHaveBeenCalledTimes(10)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('SetSelectionBar: wishlist', () => {
  it('voegt alleen nieuwe kaarten toe en zet ook de bestaande wens in de gekozen eigen lijst', async () => {
    render(<SetSelectionBar {...base} selected={cardsOf(3)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Wishlist' }))
    expect(await screen.findByText('3 selected: 2 new, 1 already on your wishlist.')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Cheap deals' })).toBeNull()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Birthday' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 to wishlist' }))

    expect(db.addWishlistItems).toHaveBeenCalledTimes(1)
    expect(db.addWishlistItems.mock.calls[0][0].map((w) => [w.tcgdex_id, w.card_number, w.set_code, w.language])).toEqual([
      ['en/sv03.5-001', '1', 'MEW', 'en'],
      ['en/sv03.5-003', '3', 'MEW', 'en'],
    ])
    expect(db.setListItems).toHaveBeenCalledWith('l3', { add: ['n1', 'n2', 'w-old'], remove: [] })
    expect(screen.getByRole('status').textContent).toBe('2 cards added to your wishlist (1 already on it). Put in Birthday.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zonder wishlist geen knop; "Select all" en "Clear" roepen de pagina aan', async () => {
    const onSelectAll = vi.fn()
    const onClear = vi.fn()
    render(<SetSelectionBar {...base} wishlist={false} selected={cardsOf(2)} onSelectAll={onSelectAll} onClear={onClear} />)
    expect(screen.queryByRole('button', { name: 'Wishlist' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Select all (165)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onSelectAll).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
