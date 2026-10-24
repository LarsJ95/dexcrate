// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardmarketPrice, SetCard } from '../lib/tcgdex'
import type { WishlistItem } from '../lib/wishlist'
import { NO_WISH_FILTERS } from '../lib/wishFilters'

// Paginatest: database en zware onderdelen nagebootst; het gaat om tonen, zoeken, filteren, slimme lijsten en bladeren.
const wish = (id: string, over: Partial<WishlistItem>): WishlistItem => ({
  id,
  tcgdex_id: null,
  name: id,
  set_code: null,
  card_number: null,
  variant: null,
  language: null,
  min_condition: null,
  wanted_qty: 1,
  max_price: null,
  priority: 2,
  notes: null,
  created_at: '2026-10-16T10:00:00Z',
  ...over,
})
const WISHES: WishlistItem[] = [
  wish('w1', { name: 'Squirtle', tcgdex_id: 'en/sv07-148', set_code: 'SCR', card_number: '148', priority: 1 }),
  wish('w2', { name: 'Dangerous Laser', tcgdex_id: 'en/sv06.5-058', set_code: 'SFA', card_number: '58' }),
  wish('w3', { name: 'Pikachu', tcgdex_id: 'ja/SV2a-025', language: 'ja', priority: 3 }),
  wish('w4', { name: 'Old Promo', set_code: 'PR', card_number: '7' }),
]
const state = vi.hoisted(() => ({ enabled: true as boolean | undefined }))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useWishlistEnabled', () => ({ useWishlistEnabled: () => state.enabled }))
vi.mock('../hooks/useDbFeature', () => ({ useDbFeature: () => true }))
vi.mock('../hooks/useCatalogInfos', () => ({ useCatalogInfos: () => new Map() }))
vi.mock('../hooks/useCardPrices', () => ({ useCardPrices: () => new Map() }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: (key: string | null) => (key ? ({ trend: 2, avg30: 2, idProduct: 1000 } as unknown as CardmarketPrice) : null) }))
vi.mock('../lib/prices', () => ({ marketValue: (p: { trend: number } | null) => (p ? { value: p.trend } : null) }))
vi.mock('../lib/wishlist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/wishlist')>()),
  listWishlist: vi.fn(async () => WISHES),
}))
vi.mock('../lib/db', () => ({
  // Squirtle heb je al: die wens is "gevonden".
  listCards: vi.fn(async () => [{ id: 'c1', tcgdex_id: 'en/sv07-148', ownership: 'owned', status: 'collection', quantity: 1, variant: null, language: 'en' }]),
}))
vi.mock('../lib/wishlistLists', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/wishlistLists')>()
  return {
    hasWishlistLists: async () => true,
    hasManualLists: async () => true,
    listWishlistLists: vi.fn(async () => [
      { id: 'l1', name: 'High only', kind: 'smart', filters: { ...NO_WISH_FILTERS, priority: 1, showFound: true }, sort_order: 1 },
      { id: 'l2', name: 'Binder page', kind: 'manual', filters: NO_WISH_FILTERS, sort_order: 2 },
    ]),
    // Eigen lijst "Binder page" bevat alleen Old Promo.
    listListMembers: vi.fn(async () => new Map([['l2', new Set(['w4'])]])),
    listChanges: real.listChanges,
    setItemLists: vi.fn(async () => {}),
    updateWishlistList: vi.fn(),
  }
})
vi.mock('../components/WishListPickSheet', () => ({ WishListPickSheet: () => <div role="dialog" aria-label="Choose wishes" /> }))
vi.mock('../components/CardImage', () => ({ CardImage: () => null }))
vi.mock('../components/SetIcon', () => ({ CardSetSymbol: () => null }))
vi.mock('../components/SetPicker', () => ({ SetPicker: () => null }))
vi.mock('../components/CatalogFilterFields', () => ({ CatalogFilterFields: () => null }))
vi.mock('../components/CatalogResults', () => ({ CatalogResults: ({ query }: { query: string }) => <p>Database results for {query}</p> }))
vi.mock('../components/WishlistListSheet', () => ({ WishlistListSheet: () => <div role="dialog" aria-label="List" /> }))
vi.mock('../components/WishlistDialog', () => ({
  WishlistDialog: ({ item }: { item: WishlistItem | null }) => <div role="dialog" aria-label={`Edit ${item?.name ?? 'new'}`} />,
}))
vi.mock('../components/SetCardSheet', () => ({
  SetCardSheet: ({ card, nav, actions }: { card: SetCard; nav?: { position: number; total: number; onNext: (() => void) | null }; actions?: JSX.Element }): JSX.Element => (
    <div role="dialog" aria-label={card.name}>
      <p>
        {nav?.position} of {nav?.total}
      </p>
      <button type="button" disabled={!nav?.onNext} onClick={() => nav?.onNext?.()}>
        Next
      </button>
      {actions}
    </div>
  ),
}))

const { WishlistPage } = await import('./WishlistPage')

afterEach(() => {
  cleanup()
  state.enabled = true
})

const names = (): string[] => screen.queryAllByRole('listitem').filter((li) => li.classList.contains('wish-item')).map((li) => li.querySelector('.tx-title')?.firstChild?.textContent ?? '')

async function renderPage(): Promise<void> {
  render(<WishlistPage />)
  await screen.findByText(/3 wanted, 1 found/)
}

describe('WishlistPage', () => {
  it('toont wat je zoekt; gevonden wensen pas met "Show found"', async () => {
    await renderPage()
    expect(names()).toEqual(['Dangerous Laser', 'Pikachu', 'Old Promo'])
    await userEvent.click(screen.getByLabelText('Show found'))
    expect(names()).toContain('Squirtle')
  })

  it('zoeken filtert je wensen en zoekt ook in de kaartendatabase', async () => {
    await renderPage()
    await userEvent.type(screen.getByLabelText('Search your wishlist and the card database'), 'pika')
    expect(names()).toEqual(['Pikachu'])
    expect(screen.getByText('Database results for pika')).toBeTruthy()
  })

  it('filter op prioriteit en wissen', async () => {
    await renderPage()
    await userEvent.selectOptions(screen.getByLabelText('Priority'), '3')
    expect(names()).toEqual(['Pikachu'])
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(names()).toHaveLength(3)
  })

  it('slimme lijst zet zijn filters; aanpassen biedt "Update"', async () => {
    await renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^High only/ }))
    expect(names()).toEqual(['Squirtle'])
    await userEvent.selectOptions(screen.getByLabelText('Priority'), '')
    expect(screen.getByRole('button', { name: 'Update “High only”' })).toBeTruthy()
  })

  it('eigen lijst toont alleen de gekozen wensen, zonder "Update", met "Choose wishes"', async () => {
    await renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^Binder page/ }))
    expect(names()).toEqual(['Old Promo'])
    await userEvent.selectOptions(screen.getByLabelText('Priority'), '1')
    expect(screen.queryByRole('button', { name: /Update/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Choose wishes' }))
    expect(screen.getByRole('dialog', { name: 'Choose wishes' })).toBeTruthy()
  })

  it('gekoppelde wens opent als kaart met bladeren en "Edit wish"; ongekoppeld meteen bewerken', async () => {
    await renderPage()
    await userEvent.click(screen.getByText('Dangerous Laser'))
    const sheet = screen.getByRole('dialog', { name: 'Dangerous Laser' })
    expect(within(sheet).getByText('1 of 2')).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Pikachu' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Edit wish' }))
    expect(screen.getByRole('dialog', { name: 'Edit Pikachu' })).toBeTruthy()
    cleanup()
    await renderPage()
    await userEvent.click(screen.getByText('Old Promo'))
    expect(screen.getByRole('dialog', { name: 'Edit Old Promo' })).toBeTruthy()
  })

  it('Cardmarket: Engelse taalfilter alleen bij Engelse of onbekende taal', async () => {
    await renderPage()
    const link = (name: string): string => {
      const li = screen.getByText(name).closest('li')
      return li?.querySelector('a')?.getAttribute('href') ?? ''
    }
    expect(link('Dangerous Laser')).toContain('language=1')
    expect(link('Pikachu')).not.toContain('language=')
    expect(link('Pikachu')).toContain('minCondition=3')
  })

  it('zonder STAP6: uitleg in plaats van een lege lijst', () => {
    state.enabled = false
    render(<WishlistPage />)
    expect(screen.getByText(/not available yet/)).toBeTruthy()
  })
})
