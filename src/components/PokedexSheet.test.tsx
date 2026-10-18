// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PokedexSheet } from './PokedexSheet'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

afterEach(cleanup)

describe('PokedexSheet', () => {
  it('kaart openen laat de Pokédex open, met dezelfde Pokémon geselecteerd', async () => {
    const onClose = vi.fn()
    const onOpenCard = vi.fn()
    const caught = new Map([[25, { cards: [{ id: 'c1', name: 'Pikachu MEW #25' }] }]])
    render(<PokedexSheet gen={1} caught={caught} onClose={onClose} onOpenCard={onOpenCard} />)
    await userEvent.click(screen.getByRole('button', { name: '#25: Pikachu MEW #25' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pikachu MEW #25' }))
    expect(onOpenCard).toHaveBeenCalledWith('c1')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('#0025')
  })
})
