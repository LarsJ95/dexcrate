import { describe, expect, it } from 'vitest'
import { correctRecognition, plainNumber, scanQuery, toScanResult, type Recognition } from './scanResult'

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
    expect(() => toScanResult({ result: { is_card: true } })).toThrow(/latest function/)
    expect(() => toScanResult(null)).toThrow()
  })
})

const scanned: Recognition = {
  position: 3,
  namePrinted: '咚咚鼠',
  nameEnglish: 'Dedenne',
  language: 'zh-tw',
  setCode: 'CSMC',
  cardNumber: '004',
  setTotal: '012',
  variant: 'holo',
  confidence: 'medium',
  notes: 'Number partly hidden.',
}

describe('scanQuery', () => {
  it('lege velden worden null', () => {
    expect(scanQuery(scanned)).toEqual({ name: 'Dedenne', name_printed: '咚咚鼠', set_code: 'CSMC', card_number: '004', set_total: '012' })
    expect(scanQuery({ ...scanned, namePrinted: '', setCode: '', cardNumber: '', setTotal: '' })).toEqual({
      name: 'Dedenne',
      name_printed: null,
      set_code: null,
      card_number: null,
      set_total: null,
    })
  })
})

describe('correctRecognition', () => {
  it('neemt je verbeteringen over; twijfel en toelichting vervallen; rest blijft', () => {
    const r = correctRecognition(scanned, { name: ' Dedenne ', setCode: ' S12 ', cardNumber: '45', setTotal: '98', language: 'zh-cn' })
    expect(r).toEqual({ ...scanned, nameEnglish: 'Dedenne', setCode: 'S12', cardNumber: '45', setTotal: '98', language: 'zh-cn', confidence: 'high', notes: '' })
  })

  it('andere naam: de gedrukte naam van de scan vervalt (anders telt die nog bij het controleren)', () => {
    const r = correctRecognition(scanned, { name: 'Pikachu', setCode: 'S12', cardNumber: '45', setTotal: '', language: 'zh-cn' })
    expect(r.namePrinted).toBe('')
  })

  it('"004/012" in het nummerveld wordt nummer en totaal', () => {
    const r = correctRecognition(scanned, { name: 'Dedenne', setCode: '', cardNumber: ' 004 / 012 ', setTotal: '', language: null })
    expect(r).toMatchObject({ setCode: '', cardNumber: '004', setTotal: '012', language: null })
  })

  it('kapt extreem lange invoer af', () => {
    const r = correctRecognition(scanned, { name: 'x'.repeat(500), setCode: 'y'.repeat(50), cardNumber: '1'.repeat(50), setTotal: '2'.repeat(50), language: 'en' })
    expect([r.nameEnglish.length, r.setCode.length, r.cardNumber.length, r.setTotal.length]).toEqual([200, 20, 20, 10])
  })
})

describe('plainNumber', () => {
  it('haalt voorloopnullen weg, laat promo-nummers staan', () => {
    expect(plainNumber('007')).toBe('7')
    expect(plainNumber('SV13')).toBe('SV13')
  })
})
