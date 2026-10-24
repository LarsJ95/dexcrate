// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CARD, type Card } from '../lib/types'

const db = vi.hoisted(() => ({ deleteCards: vi.fn() }))
vi.mock('../lib/db', () => ({ deleteCards: db.deleteCards }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
const { DeleteCardsDialog } = await import('./DeleteCardsDialog')

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

const card = (i: number, over: Partial<Card> = {}): Card => ({ ...EMPTY_CARD, id: `c${i}`, user_id: 'u', created_at: '', updated_at: '', photos: [], split_from: null, name: `Card ${i}`, ...over }) as Card
const cards = (n: number): Card[] => Array.from({ length: n }, (_, i) => card(i))

// Accolades: een functie die beforeEach teruggeeft roept Vitest na de test aan (mockReset geeft de mock terug).
beforeEach(() => {
  db.deleteCards.mockReset()
})
afterEach(cleanup)

describe('DeleteCardsDialog', () => {
  it('weinig kaarten: één klik op Delete, daarna de id’s terug', async () => {
    db.deleteCards.mockResolvedValue(undefined)
    const onDeleted = vi.fn()
    render(<DeleteCardsDialog cards={cards(2)} all={false} onClose={vi.fn()} onDeleted={onDeleted} />)
    expect(screen.queryByLabelText(/Type DELETE/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2 cards' }))
    expect(db.deleteCards).toHaveBeenCalledWith(['c0', 'c1'], expect.any(Function))
    expect(onDeleted).toHaveBeenCalledWith(['c0', 'c1'], null)
  })

  it('10 of meer, of alles in het filter: pas na het typen van DELETE', async () => {
    db.deleteCards.mockResolvedValue(undefined)
    render(<DeleteCardsDialog cards={cards(12)} all={false} onClose={vi.fn()} onDeleted={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Delete 12 cards' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText(/Type DELETE/), 'delet')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText(/Type DELETE/), 'e')
    expect((button as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    render(<DeleteCardsDialog cards={cards(1)} all onClose={vi.fn()} onDeleted={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Delete 1 card' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('fout halverwege: wat al weg is wordt doorgegeven, met hoeveel', async () => {
    db.deleteCards.mockImplementation(async (_ids: string[], onProgress: (n: number) => void) => {
      onProgress(100)
      throw new Error('Deleting failed: timeout')
    })
    const onDeleted = vi.fn()
    const list = cards(150)
    render(<DeleteCardsDialog cards={list} all={false} onClose={vi.fn()} onDeleted={onDeleted} />)
    await userEvent.type(screen.getByLabelText(/Type DELETE/), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: 'Delete 150 cards' }))
    expect(onDeleted).toHaveBeenCalledWith(
      list.slice(0, 100).map((c) => c.id),
      expect.stringContaining('100 of 150 cards were deleted'),
    )
  })

  it('verkochte of geruilde kaarten: melding dat de aan-/verkoop blijft', () => {
    render(<DeleteCardsDialog cards={[card(1, { ownership: 'sold' }), card(2)]} all={false} onClose={vi.fn()} onDeleted={vi.fn()} />)
    expect(screen.getByText(/1 of these cards are sold or traded/)).toBeTruthy()
  })
})
