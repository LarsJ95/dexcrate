// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Variant } from '../lib/types'
import { VariantGapNote, VariantSelect } from './VariantSelect'

/** Kaartinfo en prijs alvast in de cache (zoals na een eerder bezoek): geen netwerk nodig. */
function seed(key: string, variants: Variant[] | null, trend: number, trendHolo: number | null): void {
  const t = Date.now()
  localStorage.setItem(`tcgdex:card:v7:${key}`, JSON.stringify({ t, v: { key, lang: 'en', name: 'Dragonite', localId: '149', image: null, variants, set: { id: 'sv03.5', name: '151', logo: null } } }))
  localStorage.setItem(
    `tcgdex:price:v2:${key}`,
    JSON.stringify({ t, v: { idProduct: 1, updated: null, trend, low: null, avg1: null, avg7: null, avg30: null, trendHolo, lowHolo: null, avg1Holo: null, avg7Holo: null, avg30Holo: null } }),
  )
}

beforeEach(() => {
  localStorage.clear()
  // Alles moet uit de cache komen.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('geen netwerk in deze test'))))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const optionTexts = (): string[] => [...(screen.getByRole('combobox') as HTMLSelectElement).options].map((o) => o.textContent ?? '')

describe('VariantSelect', () => {
  it('alleen uitvoeringen uit de catalogus, met prijs als die verschilt', async () => {
    seed('en/sv03.5-149', ['holo', 'reverse'], 0.74, 3.08)
    const onChange = vi.fn()
    render(<VariantSelect cardKey="en/sv03.5-149" value="holo" onChange={onChange} label="Variant of Dragonite" />)
    await vi.waitFor(() => expect(optionTexts()).toEqual(['Variant unknown', 'Holo · €0.74', 'Reverse holo · €3.08']))
    await userEvent.selectOptions(screen.getByLabelText('Variant of Dragonite'), 'reverse')
    expect(onChange).toHaveBeenLastCalledWith('reverse')
    await userEvent.selectOptions(screen.getByLabelText('Variant of Dragonite'), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('huidige waarde die niet bestaat blijft zichtbaar, met "not in catalog"', async () => {
    seed('en/sv03.5-151', ['holo'], 7.15, null)
    render(<VariantSelect cardKey="en/sv03.5-151" value="reverse" onChange={() => {}} label="Variant" />)
    await vi.waitFor(() => expect(optionTexts()).toEqual(['Variant unknown', 'Holo', 'Reverse holo (not in catalog)']))
  })

  it('zonder koppeling: alle uitvoeringen, geen prijzen', () => {
    render(<VariantSelect cardKey={null} value={null} onChange={() => {}} label="Variant" />)
    expect(optionTexts()).toEqual(['Variant unknown', 'Normal', 'Holo', 'Reverse holo', '1st edition'])
  })
})

describe('VariantGapNote', () => {
  it('meldt een flink prijsverschil, anders niets', async () => {
    seed('en/sv03.5-149', ['holo', 'reverse'], 0.74, 3.08)
    seed('en/sv03.5-025', ['normal', 'reverse'], 0.05, 0.12)
    const { rerender, container } = render(<VariantGapNote cardKey="en/sv03.5-149" />)
    expect((await screen.findByText(/Version matters/)).textContent).toBe('Version matters: Holo €0.74, Reverse holo €3.08. Check which one you have.')
    rerender(<VariantGapNote cardKey="en/sv03.5-025" />)
    await vi.waitFor(() => expect(container.textContent).toBe(''))
  })
})
