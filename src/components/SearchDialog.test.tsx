// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom kent showModal en close niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open')
}
// jsdom kent scrollIntoView niet.
Element.prototype.scrollIntoView = function scrollIntoView() {}

const spy = vi.hoisted(() => ({ requestOpenCard: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('./SetIcon', () => ({ SetIcon: () => null }))
vi.mock('../lib/openCard', () => ({ requestOpenCard: spy.requestOpenCard }))
vi.mock('../lib/db', () => ({
  listCards: vi.fn(async () => [
    { id: 'c1', name: 'Pikachu', set_code: 'MEW', card_number: '25', quantity: 2, kind: 'card', tcgdex_id: 'en/sv03.5-025', status: 'collection' },
  ]),
}))
vi.mock('../lib/tcgdex', async (orig) => ({
  ...(await orig<typeof import('../lib/tcgdex')>()),
  getSetList: vi.fn(async (lang: string) =>
    lang === 'en'
      ? new Map([
          ['det1', { id: 'det1', name: 'Detective Pikachu', logo: null }],
          ['sv03.5', { id: 'sv03.5', name: '151', logo: null }],
        ])
      : new Map(),
  ),
  digitalSetIds: vi.fn(async () => new Set<string>()),
  resolveSetId: vi.fn(async () => null),
}))

const { SearchDialog } = await import('./SearchDialog')

afterEach(() => {
  cleanup()
  spy.requestOpenCard.mockClear()
  // Zonder popstate (dat zou de terugknop-afhandeling van popups in de volgende test raken).
  window.history.replaceState(null, '', '#')
})

const box = (): HTMLElement => screen.getByRole('combobox', { name: 'Search pages, sets and your cards' })
const options = (): string[] => screen.queryAllByRole('option').map((o) => o.textContent ?? '')

describe('SearchDialog', () => {
  it('zonder tekst de pagina’s; het zoekveld heeft meteen de focus', () => {
    render(<SearchDialog onClose={() => {}} />)
    expect(document.activeElement).toBe(box())
    expect(options()[0]).toBe('Home')
  })

  it('Pokémon-naam: eerst je eigen kaart; Enter opent hem in My cards', async () => {
    const onClose = vi.fn()
    render(<SearchDialog onClose={onClose} />)
    await userEvent.type(box(), 'pikachu')
    await screen.findByText('Detective Pikachu')
    expect(options()).toEqual(['PikachuMEW · #25 · 2×', 'Detective PikachuEnglish'])
    await userEvent.keyboard('{Enter}')
    expect(spy.requestOpenCard).toHaveBeenCalledWith('c1')
    expect(onClose).toHaveBeenCalled()
  })

  it('setnaam: eerst de set; pijltje omlaag en Enter gaan naar de gekozen regel', async () => {
    render(<SearchDialog onClose={() => {}} />)
    await userEvent.type(box(), '151')
    await screen.findByText('151')
    expect(options()[0]).toBe('151English · 1 owned')
    await userEvent.keyboard('{Enter}')
    expect(window.location.hash).toBe('#/sets/en/sv03.5')
  })

  it('niets gevonden: dat staat er', async () => {
    render(<SearchDialog onClose={() => {}} />)
    await userEvent.type(box(), 'qqqq')
    expect(await screen.findByText('Nothing found for “qqqq”.')).toBeTruthy()
  })
})
