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

const noSearch = (): Promise<void> => Promise.resolve()

const earlier: ScanItem ={ card_id: 'c1', name: 'Pikachu', set_code: 'MEW', card_number: '25', tcgdex_id: 'xx/sv2a-025', variant: null, quantity: 1, at: '' }

describe('SingleScanResult', () => {
  it('toont wat er herkend is, met twijfel', () => {
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map()} earlier={null} onChoose={() => {}} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={noSearch} />)
    expect(screen.getByText('Pikachu', { selector: '.scan-name' })).toBeTruthy()
    expect(screen.getByText(/SV2a, 025\/165, Japanese/)).toBeTruthy()
    expect(screen.getByText(/uncertain, please check/)).toBeTruthy()
  })

  it('kiest een kandidaat of voegt toe zonder koppeling', async () => {
    const onChoose = vi.fn()
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map([['xx/sv2a-026', 2]])} earlier={null} onChoose={onChoose} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={noSearch} />)
    expect(screen.getByText('Best match')).toBeTruthy()
    expect(screen.getByText('Owned 2×')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Raichu/ }))
    expect(onChoose).toHaveBeenLastCalledWith(candidates[1])
    await userEvent.click(screen.getByRole('button', { name: 'Add without link' }))
    expect(onChoose).toHaveBeenLastCalledWith(null)
  })

  it('alleen suggesties met een ander nummer: geen "Best match", wel uitleg', async () => {
    const onChoose = vi.fn()
    const dedenne: Recognition = { ...recognition, nameEnglish: 'Dedenne', language: 'zh-cn', setCode: 'CSMC', cardNumber: '004', setTotal: '012', confidence: 'high' }
    const guess: Candidate = { key: 'xx/SV8-055', name: '咚咚鼠', localId: '055', setId: 'SV8', setName: '超電突圍', image: null, score: 3, reason: 'Name (咚咚鼠), other number', otherNumber: true }
    const { container } = render(<SingleScanResult recognition={dedenne} candidates={[guess]} ownedByKey={new Map()} earlier={null} onChoose={onChoose} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={noSearch} />)
    expect(screen.queryByText('Best match')).toBe(null)
    expect(container.querySelector('.candidate.selected')).toBe(null)
    expect(screen.getByText(/No card with number 004 in the catalog \(set CSMC may be missing\)/)).toBeTruthy()
    expect(screen.getByText('Name (咚咚鼠), other number')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add without link' }))
    expect(onChoose).toHaveBeenLastCalledWith(null)
  })

  it('gelezen waarden verbeteren en opnieuw zoeken; fout blijft in het formulier staan', async () => {
    const onSearch = vi.fn<(r: Recognition) => Promise<void>>().mockRejectedValueOnce(new Error('No internet connection')).mockResolvedValueOnce(undefined)
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map()} earlier={null} onChoose={() => {}} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={onSearch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Correct' }))
    const number = screen.getByLabelText('Number')
    await userEvent.clear(number)
    await userEvent.type(number, '26/165')
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'en')
    await userEvent.click(screen.getByRole('button', { name: 'Search again' }))
    expect(onSearch).toHaveBeenLastCalledWith({ ...recognition, cardNumber: '26', setTotal: '165', language: 'en', confidence: 'high', notes: '' })
    expect((await screen.findByRole('alert')).textContent).toBe('No internet connection')
    // Opnieuw: lukt, formulier sluit.
    await userEvent.click(screen.getByRole('button', { name: 'Search again' }))
    expect(onSearch).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('form', { name: 'Correct what was read' })).toBe(null)
    expect(screen.getByRole('button', { name: 'Correct' })).toBeTruthy()
  })

  it('Search again kan niet zonder naam', async () => {
    const onSearch = vi.fn(noSearch)
    render(<SingleScanResult recognition={recognition} candidates={candidates} ownedByKey={new Map()} earlier={null} onChoose={() => {}} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={onSearch} />)
    await userEvent.click(screen.getByRole('button', { name: 'Correct' }))
    await userEvent.clear(screen.getByLabelText('Name'))
    expect((screen.getByRole('button', { name: 'Search again' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSearch).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Name')).toBe(null)
  })

  it('marktprijs (met reverse holo) bij de bovenste 3 kandidaten, niet bij de rest', async () => {
    const keys = ['en/sv03.5-025', 'en/sv03.5-026', 'en/sv03.5-027', 'en/sv03.5-028']
    const price = (trend: number) => ({ idProduct: 1, updated: null, trend, low: null, avg1: null, avg7: null, avg30: null, trendHolo: trend * 10, lowHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null })
    keys.forEach((k, i) => localStorage.setItem(`tcgdex:price:v2:${k}`, JSON.stringify({ t: Date.now(), v: price(0.05 * (i + 1)) })))
    const many: Candidate[] = keys.map((key, i) => ({ ...candidates[0], key, localId: String(25 + i), score: 5 - i }))
    const { container } = render(<SingleScanResult recognition={recognition} candidates={many} ownedByKey={new Map()} earlier={null} onChoose={() => {}} onAddAnotherCopy={() => {}} onReset={() => {}} onSearch={noSearch} />)
    await vi.waitFor(() => expect([...container.querySelectorAll('.cand-price')].map((e) => e.textContent)).toEqual(['€0.05RH €0.50', '€0.10RH €1.00', '€0.15RH €1.50']))
  })

  it('vraagt eerst bij een kaart die al in de sessie zit', async () => {
    const onAddAnotherCopy = vi.fn()
    const onReset = vi.fn()
    render(<SingleScanResult recognition={recognition} candidates={[]} ownedByKey={new Map()} earlier={earlier} onChoose={() => {}} onAddAnotherCopy={onAddAnotherCopy} onReset={onReset} onSearch={noSearch} />)
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
