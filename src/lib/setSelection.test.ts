import { describe, expect, it, vi } from 'vitest'
import { cardmarketUrlFor, openTabs, wishForSetCard, wishSummary } from './setSelection'

const card = { id: 'sv03.5-025', localId: '025', name: 'Pikachu', image: null }

describe('wishForSetCard', () => {
  it('zoals "Add to wishlist" in het kaartvenster: nummer zonder voorloopnullen, taal van de set, standaardwaarden', () => {
    expect(wishForSetCard(card, 'en', 'MEW')).toEqual({
      tcgdex_id: 'en/sv03.5-025',
      name: 'Pikachu',
      set_code: 'MEW',
      card_number: '25',
      variant: null,
      language: 'en',
      min_condition: null,
      wanted_qty: 1,
      max_price: null,
      priority: 2,
      notes: null,
    })
  })

  it('houdt zich aan de grenzen van de database', () => {
    const w = wishForSetCard({ ...card, id: 'x'.repeat(60), localId: 'TG30', name: 'A'.repeat(250) }, 'ja', 'S'.repeat(30))
    expect(w.tcgdex_id).toBeNull()
    expect(w.name).toHaveLength(200)
    expect(w.set_code).toHaveLength(20)
    expect(w.card_number).toBe('TG30')
    expect(wishForSetCard({ ...card, name: '  ' }, 'en', '').name).toBe('#025')
    expect(wishForSetCard(card, 'en', ' ').set_code).toBeNull()
  })
})

describe('wishSummary', () => {
  it('telt toegevoegd, al aanwezig en lijsten', () => {
    expect(wishSummary(9, 3, [])).toBe('9 cards added to your wishlist (3 already on it).')
    expect(wishSummary(1, 0, ['Birthday'])).toBe('1 card added to your wishlist. Put in Birthday.')
    expect(wishSummary(0, 3, ['Birthday', 'Binder'])).toBe('All 3 cards were already on your wishlist. Put in Birthday, Binder.')
    expect(wishSummary(0, 1, [])).toBe('This card was already on your wishlist.')
  })
})

describe('cardmarketUrlFor', () => {
  it('productpagina met id, anders zoeken op naam en nummer', () => {
    expect(cardmarketUrlFor(card, 'en', 123)).toContain('Products?idProduct=123')
    expect(cardmarketUrlFor(card, 'ja', null)).toContain('searchString=Pikachu%20025')
  })
})

describe('openTabs', () => {
  it('opent in volgorde, wist opener en stopt bij het eerste geblokkeerde tabblad', () => {
    const tab = { opener: 'page' } as unknown as Window
    const open = vi.fn().mockReturnValueOnce(tab).mockReturnValueOnce(null).mockReturnValue(tab)
    expect(openTabs(['a', 'b', 'c'], open)).toBe(1)
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenNthCalledWith(1, 'a', '_blank')
    expect(tab.opener).toBeNull()
  })

  it('alles toegestaan: alles open', () => {
    const open = vi.fn(() => ({ opener: null }) as unknown as Window)
    expect(openTabs(['a', 'b', 'c'], open)).toBe(3)
    expect(openTabs([], open)).toBe(0)
  })
})
