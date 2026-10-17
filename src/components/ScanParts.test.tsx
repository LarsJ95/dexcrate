// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../lib/match'
import type { Recognition } from '../lib/scan'
import type { ScanItem } from '../lib/scanSessions'

// Kaartfoto's kunnen via de Edge Function card-image lopen; de Supabase-client is hier niet nodig.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { ScanSessionSummary, SingleScanResult } = await import('./ScanParts')

afterEach(cleanup)

const recognition: Recognition = {
  position: 1,
  namePrinted: 'ピカチュウ',
  nameEnglish: 'Pikachu',
  language: 'ja',
  setCode: 'SV2a',
  cardNumber: '025',
  setTotal: '165',
  variant: null,
  confidence: 'medium',
  notes: '',
}

// Zonder afbeelding en met een onbekende taal blijft de kaartfoto bij de getekende voorkant (geen netwerk).
const candidates: Candidate[] = [
  { key: 'xx/sv2a-025', name: 'Pikachu', localId: '025', setId: 'sv2a', setName: '151', image: null, score: 1, reason: 'Name and number' },
  { key: 'xx/sv2a-026', name: 'Raichu', localId: '026', setId: 'sv2a', setName: '151', image: null, score: 0.4, reason: 'Number close' },
]

const earlier: ScanItem = { card_id: 'c1', name: 'Pikachu', set_code: 'MEW', card_number: '25', tcgdex_id: 'xx/sv2a-025', variant: null, quantity: 1, at: '' }

describe('SingleScanResult', () => {
  it('toont wat er herkend is, met twijfel', () => {
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map()} earlier={null} onChoose={() => {}} onAddAnotherCopy={() => {}} onReset={() => {}} />)
    expect(screen.getByText('Pikachu', { selector: '.scan-name' })).toBeTruthy()
    expect(screen.getByText(/SV2a, 025\/165, Japanese/)).toBeTruthy()
    expect(screen.getByText(/uncertain, please check/)).toBeTruthy()
  })

  it('kiest een kandidaat of voegt toe zonder koppeling', async () => {
    const onChoose = vi.fn()
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map([['xx/sv2a-026', 2]])} earlier={null} onChoose={onChoose} onAddAnotherCopy={() => {}} onReset={() => {}} />)
    expect(screen.getByText('Best match')).toBeTruthy()
    expect(screen.getByText('Owned 2×')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Raichu/ }))
    expect(onChoose).toHaveBeenLastCalledWith(candidates[1])
    await userEvent.click(screen.getByRole('button', { name: 'Add without link' }))
    expect(onChoose).toHaveBeenLastCalledWith(null)
  })

  it('vraagt eerst bij een kaart die al in de sessie zit', async () => {
    const onAddAnotherCopy = vi.fn()
    const onReset = vi.fn()
    render(<SingleScanResult recognition={recognition} candidates={[]} ownedByKey={new Map()} earlier={earlier} onChoose={() => {}} onAddAnotherCopy={onAddAnotherCopy} onReset={onReset} />)
    expect(screen.getByRole('alert').textContent).toContain('You already added Pikachu #25 in this session')
    expect(screen.getByText('No match found. You can add it without a link.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add another copy' }))
    await userEvent.click(screen.getByRole('button', { name: /Skip/ }))
    expect(onAddAnotherCopy).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
  })
})

describe('ScanSessionSummary', () => {
  it('toont niets zonder sessie en zonder toegevoegde kaarten', () => {
    const { container } = render(<ScanSessionSummary session={null} added={[]} onEnd={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('toont toegevoegde kaarten zonder sessie', () => {
    render(<ScanSessionSummary session={null} added={['Pikachu', 'Eevee']} onEnd={() => {}} />)
    expect(screen.getByRole('status').textContent).toBe('Added: Pikachu, Eevee')
  })

  it('telt de sessie en kort lange lijsten in', async () => {
    const onEnd = vi.fn()
    const items = Array.from({ length: 10 }, (_, i) => ({ ...earlier, card_id: `c${i}`, name: `Card ${i}`, quantity: i === 9 ? 3 : 1 }))
    render(<ScanSessionSummary session={{ id: 's1', items, created_at: '' }} added={[]} onEnd={onEnd} />)
    expect(screen.getByText(/This session: 12 cards, saved/)).toBeTruthy()
    expect(screen.getByText(/Card 2, .*3× Card 9 and 2 more/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(onEnd).toHaveBeenCalledOnce()
  })
})
