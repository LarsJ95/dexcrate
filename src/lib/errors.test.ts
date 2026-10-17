import { afterEach, describe, expect, it, vi } from 'vitest'
import { OFFLINE_TEXT, errorText, isNetworkError } from './errors'

afterEach(() => vi.unstubAllGlobals())

describe('errorText', () => {
  it('netwerkfouten van elke browser worden een duidelijke melding', () => {
    for (const m of ['Failed to fetch', 'TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(errorText(new Error(m), 'x')).toBe(OFFLINE_TEXT)
    }
  })

  it('andere fouten houden hun eigen tekst; leeg of geen Error → standaardtekst', () => {
    expect(errorText(new Error('Card not found.'), 'Saving failed.')).toBe('Card not found.')
    expect(errorText(new Error(''), 'Saving failed.')).toBe('Saving failed.')
    expect(errorText('boom', 'Saving failed.')).toBe('Saving failed.')
  })

  it('offline: elke fout telt als verbindingsfout', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(isNetworkError(new Error('Card not found.'))).toBe(true)
    expect(errorText(new Error('Card not found.'), 'x')).toBe(OFFLINE_TEXT)
  })
})
