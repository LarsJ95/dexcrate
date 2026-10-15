import { describe, expect, it } from 'vitest'
import { plainNumber, toScanResult } from './scanResult'

describe('toScanResult', () => {
  it('zet het antwoord van de Edge Function om en sorteert op positie', () => {
    const r = toScanResult({
      model: 'claude-haiku-5-5',
      cards: [
        { position: 2, name_english: 'Pikachu', name_printed: 'ピカチュウ', language: 'ja', set_code: 'SV8', card_number: '057', confidence: 'medium', variant: 'holo' },
        { position: 1, name_english: ' Mew ex ', language: 'en', set_code: 'MEW', card_number: '151', set_total: '165', confidence: 'high', variant: 'unknown' },
      ],
    })
    expect(r.model).toBe('claude-haiku-5-5')
    expect(r.cards.map((c) => c.nameEnglish)).toEqual(['Mew ex', 'Pikachu'])
    expect(r.cards[0]).toMatchObject({ language: 'en', variant: null, confidence: 'high', setTotal: '165' })
    expect(r.cards[1]).toMatchObject({ language: 'ja', variant: 'holo', confidence: 'medium', cardNumber: '057' })
  })

  it('onbekende waarden worden veilig: taal null, twijfel "low", positie op volgorde', () => {
    const r = toScanResult({ cards: [{ language: 'other', confidence: 'zeker' }, 'onzin', null] })
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0]).toMatchObject({ position: 1, language: null, confidence: 'low', nameEnglish: '' })
  })

  it('lege lijst is geldig (geen kaart op de foto)', () => {
    expect(toScanResult({ cards: [], model: 'x' }).cards).toEqual([])
  })

  it('oud of kapot antwoord geeft een duidelijke fout', () => {
    expect(() => toScanResult({ result: { is_card: true } })).toThrow(/nieuwste functie/)
    expect(() => toScanResult(null)).toThrow()
  })
})

describe('plainNumber', () => {
  it('haalt voorloopnullen weg, laat promo-nummers staan', () => {
    expect(plainNumber('007')).toBe('7')
    expect(plainNumber('SV13')).toBe('SV13')
  })
})
