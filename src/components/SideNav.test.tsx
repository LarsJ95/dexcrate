// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { rememberRecentSet } from '../lib/recentSets'
import { SideNav } from './SideNav'

// Zelf gedefinieerd: lib/navCounts laadt (via de wishlist) de Supabase-client.
const NO_COUNTS = { collection: 0, wishlist: 0, photos: 0 }

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.location.hash = ''
})

describe('SideNav', () => {
  it('Scan als eerste knop, daarna groepen met kopje; Import en Backup staan er niet in', () => {
    render(<SideNav route="overview" counts={NO_COUNTS} collapsed={false} />)
    const links = screen.getAllByRole('link')
    expect(links[0].textContent).toBe('Scan cards')
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['My cards', 'Trade', 'Extras'])
    expect(screen.getByRole('link', { name: 'Photo inbox' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Crate game' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Import|Backup/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page')
  })

  it('getal alleen als er iets te doen is, met uitleg voor schermlezers', () => {
    render(<SideNav route="overview" counts={{ collection: 3, wishlist: 0, photos: 1 }} collapsed={false} />)
    expect(screen.getByRole('link', { name: 'Collection, 3 cards not linked yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Photo inbox, 1 photo to link to a card' })).toBeTruthy()
  })

  it('recente sets onder Sets; de open set is gemarkeerd', () => {
    rememberRecentSet({ lang: 'en', setId: 'sv03.5', name: '151' })
    rememberRecentSet({ lang: 'en', setId: 'sv05', name: 'Temporal Forces' })
    window.location.hash = '#/sets/en/sv03.5'
    render(<SideNav route="sets" counts={NO_COUNTS} collapsed={false} />)
    const sub = screen.getByRole('list', { name: 'Recent sets' })
    expect(within(sub).getAllByRole('link').map((a) => a.textContent)).toEqual(['Temporal Forces', '151'])
    expect(within(sub).getByRole('link', { name: '151' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Sets' }).getAttribute('aria-current')).toBe('true')
  })

  it('werkt meteen bij als je een set opent', () => {
    render(<SideNav route="sets" counts={NO_COUNTS} collapsed={false} />)
    expect(screen.queryByRole('list', { name: 'Recent sets' })).toBeNull()
    act(() => rememberRecentSet({ lang: 'en', setId: 'sv01', name: 'Scarlet & Violet' }))
    expect(screen.getByRole('link', { name: 'Scarlet & Violet' })).toBeTruthy()
  })

  it('ingeklapt: geen recente sets, wel een tooltip met de naam', () => {
    rememberRecentSet({ lang: 'en', setId: 'sv01', name: 'Scarlet & Violet' })
    render(<SideNav route="overview" counts={NO_COUNTS} collapsed />)
    expect(screen.queryByRole('list', { name: 'Recent sets' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Sets' }).getAttribute('title')).toBe('Sets')
  })
})
