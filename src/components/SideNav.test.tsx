// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('Sets zonder snelkoppelingen naar recente sets (op verzoek weg, 18-10-2026)', () => {
    render(<SideNav route="sets" counts={NO_COUNTS} collapsed={false} />)
    expect(screen.getByRole('link', { name: 'Sets' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('list', { name: 'Recent sets' })).toBeNull()
  })

  it('ingeklapt: tooltip met de naam', () => {
    render(<SideNav route="overview" counts={NO_COUNTS} collapsed />)
    expect(screen.getByRole('link', { name: 'Sets' }).getAttribute('title')).toBe('Sets')
  })
})
