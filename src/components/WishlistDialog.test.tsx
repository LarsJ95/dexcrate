// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WishlistInput, WishlistItem } from '../lib/wishlist'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

const db = vi.hoisted(() => ({
  setItemLists: vi.fn(async (_itemId: string, _change: { add: readonly string[]; remove: readonly string[] }) => {}),
  // Wensen die er al zijn, en welke wens in welke eigen lijst staat.
  wishes: [] as WishlistItem[],
  members: new Map<string, Set<string>>(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useDbFeature', () => ({ useDbFeature: () => true }))
vi.mock('../hooks/useCardInfo', () => ({ useCardInfo: () => null }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: () => null }))
vi.mock('./LinkPicker', () => ({ LinkPicker: () => null }))
vi.mock('../lib/wishlist', async (importOriginal) => ({
  sameWishes: (await importOriginal<typeof import('../lib/wishlist')>()).sameWishes,
  listWishlist: vi.fn(async () => db.wishes),
  addWishlistItem: vi.fn(async (input: WishlistInput) => ({ ...input, id: 'new-1', created_at: '2026-10-18T20:00:00Z' })),
  updateWishlistItem: vi.fn(),
  deleteWishlistItem: vi.fn(),
}))
vi.mock('../lib/wishlistLists', () => ({
  hasManualLists: vi.fn(async () => true),
  listWishlistLists: vi.fn(async () => [
    { id: 'l1', name: 'Gen 1 binder', kind: 'manual', filters: {}, sort_order: 0 },
    { id: 'l2', name: 'Cheap deals', kind: 'smart', filters: {}, sort_order: 1 },
    { id: 'l3', name: 'Birthday', kind: 'manual', filters: {}, sort_order: 2 },
  ]),
  setItemLists: db.setItemLists,
  listListMembers: vi.fn(async () => db.members),
}))

const { WishlistDialog } = await import('./WishlistDialog')

afterEach(() => {
  cleanup()
  localStorage.clear()
  db.setItemLists.mockClear()
  db.wishes = []
  db.members = new Map()
})

describe('WishlistDialog vanuit een set of de Crate (zonder meegegeven lijsten)', () => {
  it('toont alleen eigen lijsten, zet de nieuwe wens in de gekozen lijst en onthoudt die keuze', async () => {
    const onSaved = vi.fn()
    render(<WishlistDialog item={null} initial={{ name: 'Riolu', set_code: 'MEP', card_number: '10' }} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Birthday' }))
    expect(screen.queryByRole('radio', { name: 'Cheap deals' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(db.setItemLists).toHaveBeenCalledWith('new-1', { add: ['l3'], remove: [] })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1', name: 'Riolu' }), null)
    expect(localStorage.getItem('dexcrate:wish-last-lists')).toBe('l3')
  })

  it('volgende keer staat de laatst gekozen lijst al aan', async () => {
    localStorage.setItem('dexcrate:wish-last-lists', 'l1')
    render(<WishlistDialog item={null} initial={{ name: 'Pawmot' }} onClose={() => {}} onSaved={() => {}} />)
    expect(((await screen.findByRole('radio', { name: 'Gen 1 binder' })) as HTMLInputElement).checked).toBe(true)
  })

  it('lijst mislukt: wens blijft bewaard, alleen nog "Done"', async () => {
    db.setItemLists.mockRejectedValueOnce(new Error('offline'))
    const onSaved = vi.fn()
    render(<WishlistDialog item={null} initial={{ name: 'Riolu' }} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Birthday' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Saved to your wishlist/)
    expect(onSaved).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1' }), null)
  })
})

describe('al op je wishlist (24-10-2026)', () => {
  const mewtwo: WishlistItem = {
    id: 'w1',
    tcgdex_id: 'en/30c-151',
    name: 'Mewtwo ex',
    set_code: '30C',
    card_number: '151',
    variant: null,
    language: null,
    min_condition: null,
    wanted_qty: 1,
    max_price: 40,
    priority: 2,
    notes: null,
    created_at: '2026-10-20',
  }

  it('melding met de lijst waar hij al in staat; opslaan heet dan "Add anyway"', async () => {
    db.wishes = [mewtwo]
    db.members = new Map([['l1', new Set(['w1'])]])
    render(<WishlistDialog item={null} initial={{ name: 'Mewtwo ex', tcgdex_id: 'en/30c-151', set_code: '30C', card_number: '151' }} onClose={() => {}} onSaved={() => {}} />)
    const note = await screen.findByText('Already on your wishlist')
    expect(await screen.findByRole('button', { name: 'Add anyway' })).toBeTruthy()
    await screen.findByText(/in Gen 1 binder/)
    expect(note.parentElement?.textContent).toContain('€40.00')
  })

  it('in plaats van een tweede: de bestaande wens in de gekozen lijst zetten', async () => {
    db.wishes = [mewtwo]
    db.members = new Map([['l1', new Set(['w1'])]])
    const onSaved = vi.fn()
    render(<WishlistDialog item={null} initial={{ name: 'Mewtwo ex', tcgdex_id: 'en/30c-151' }} onClose={() => {}} onSaved={onSaved} />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Birthday' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add that one to Birthday instead' }))
    expect(db.setItemLists).toHaveBeenCalledWith('w1', { add: ['l3'], remove: [] })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), null)
  })

  it('andere kaart: geen melding, gewoon "Save"', async () => {
    db.wishes = [mewtwo]
    render(<WishlistDialog item={null} initial={{ name: 'Mew ex', tcgdex_id: 'en/sv03.5-151' }} onClose={() => {}} onSaved={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.queryByText('Already on your wishlist')).toBeNull()
  })
})
