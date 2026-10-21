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
  setItemLists: vi.fn(async (_itemId: string, _change: { add: readonly string[]; remove: readonly string[] }) => {}),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useDbFeature', () => ({ useDbFeature: () => true }))
vi.mock('../hooks/useCardInfo', () => ({ useCardInfo: () => null }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: () => null }))
vi.mock('./LinkPicker', () => ({ LinkPicker: () => null }))
vi.mock('../lib/wishlist', () => ({
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
}))

const { WishlistDialog } = await import('./WishlistDialog')

afterEach(() => {
  cleanup()
  localStorage.clear()
  db.setItemLists.mockClear()
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
