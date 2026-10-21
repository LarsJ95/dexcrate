// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SideNav } from './SideNav'

// Zelf gedefinieerd: lib/navCounts laadt (via de wishlist) de Supabase-client.
const NO_COUNTS = { collection: 0, wishlist: 0, crate: null }

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.location.hash = ''
})

describe('SideNav', () => {
  it('Scan als eerste knop, Crate eronder, daarna groepen met kopje; geen Photo inbox, Import of Backup', () => {
    render(<SideNav route="overview" counts={NO_COUNTS} collapsed={false} />)
    const links = screen.getAllByRole('link')
    expect(links[0].textContent).toBe('Scan cards')
    expect(links[1].textContent).toBe('Crate')
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['My cards', 'Trade'])
    expect(screen.queryByRole('link', { name: /Photo inbox/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Import|Backup/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page')
  })

  it('getal alleen als er iets te doen is, met uitleg voor schermlezers', () => {
    render(<SideNav route="overview" counts={{ collection: 3, wishlist: 0, crate: null }} collapsed={false} />)
    expect(screen.getByRole('link', { name: 'My cards, 3 cards not linked yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeTruthy()
  })

  it('Crate: punten en "Free" zolang het gratis pakje van vandaag er nog is', () => {
    render(<SideNav route="overview" counts={{ collection: 0, wishlist: 0, crate: { points: 1250, freePack: true } }} collapsed={false} />)
    expect(screen.getByRole('link', { name: /^Crate, ?1,250 pts, free pack ready$/ })).toBeTruthy()
    cleanup()
    render(<SideNav route="overview" counts={{ collection: 0, wishlist: 0, crate: { points: 40, freePack: false } }} collapsed={false} />)
    expect(screen.getByRole('link', { name: /^Crate, ?40 pts$/ })).toBeTruthy()
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
