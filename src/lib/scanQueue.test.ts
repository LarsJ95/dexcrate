import { describe, expect, it } from 'vitest'
import type { Candidate } from './match'
import type { Recognition } from './scanResult'
import type { Variant } from './types'
import { isAmbiguous, mergeDuplicate, newItem, onlyOtherNumbers, parseQueue, reviewGroups, scannedTwice, stripCandidates, summarize, withMatch, withoutCardData, type QueueItem } from './scanQueue'

const rec = (over: Partial<Recognition> = {}): Recognition => ({
  position: 1,
  namePrinted: 'Pikachu',
  nameEnglish: 'Pikachu',
  language: 'en',
  setCode: 'MEW',
  cardNumber: '25',
  setTotal: '165',
  variant: 'normal',
  confidence: 'high',
  notes: '',
  ...over,
})
const cand = (key: string): Candidate => ({ key, name: 'Pikachu', localId: '025', setId: 'sv03.5', setName: '151', image: null, score: 1, reason: '' })
const THUMB = 'data:image/jpeg;base64,AAAA'
const ready = (id: string, key = 'en/sv03.5-025', over: Partial<Recognition> = {}): QueueItem => withMatch(newItem(id, THUMB), rec(over), [cand(key)])

describe('scan-wachtrij', () => {
  it('beste match gekozen; aangevinkt alleen als leesbaar en gevonden', () => {
    expect(ready('a').chosen).toBe('en/sv03.5-025')
    expect(ready('a').include).toBe(true)
    expect(withMatch(newItem('b', THUMB), rec({ confidence: 'low' }), [cand('x')]).include).toBe(false)
    expect(withMatch(newItem('c', THUMB), rec(), []).include).toBe(false)
  })

  it('Europese taal alleen geraden: niet vanzelf aangevinkt; met taalcode of nagekeken wel; bewaard na herladen', () => {
    expect(ready('fr', 'en/sv03.5-025', { language: 'fr' }).include).toBe(false)
    expect(ready('fr2', 'en/sv03.5-025', { language: 'fr', languageChecked: true }).include).toBe(true)
    expect(ready('ja', 'ja/SV2a-025', { language: 'ja' }).include).toBe(true)
    const saved = JSON.stringify([ready('k', 'en/sv03.5-025', { language: 'de', languageChecked: true }), ready('l', 'en/sv03.5-025', { language: 'de' })])
    expect(parseQueue(saved).map((q) => q.rec?.languageChecked)).toEqual([true, undefined])
  })

  it('zelfde kaart nog eens gescand: aantal +1 in plaats van een tweede regel', () => {
    const q = mergeDuplicate([ready('a'), ready('b')], 'b')
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ id: 'a', quantity: 2 })
  })

  it('andere uitvoering of andere kaart: niet samenvoegen', () => {
    expect(mergeDuplicate([ready('a'), ready('b', 'en/sv03.5-025', { variant: 'reverse' })], 'b')).toHaveLength(2)
    expect(mergeDuplicate([ready('a'), ready('b', 'en/sv03.5-026')], 'b')).toHaveLength(2)
    expect(mergeDuplicate([newItem('a', THUMB), ready('b')], 'b')).toHaveLength(2)
  })

  it('telling', () => {
    const q = [{ ...ready('a'), quantity: 2 }, newItem('b', THUMB), { ...newItem('c', THUMB), status: 'error' as const }]
    expect(summarize(q)).toEqual({ total: 4, busy: 1, ready: 2, failed: 1, selected: 2 })
  })

  it('bewaren en herstellen; onafgemaakte foto wacht weer', () => {
    const q = parseQueue(JSON.stringify([ready('a'), newItem('b', THUMB), { id: 'x', thumb: 'javascript:alert(1)' }, 'rommel']))
    expect(q.map((i) => i.id)).toEqual(['a', 'b'])
    expect(q[0]).toMatchObject({ status: 'ready', chosen: 'en/sv03.5-025', include: true })
    expect(q[1].status).toBe('waiting')
    expect(q[1].error).toBe(null)
    expect(parseQueue(JSON.stringify([{ ...newItem('e', THUMB), status: 'error', error: 'Boom' }]))[0]).toMatchObject({ status: 'error', error: 'Boom' })
    expect(parseQueue('{kapot')).toEqual([])
    expect(parseQueue(null)).toEqual([])
  })

  it('bewaart tot 250 foto’s (sinds de lijst in IndexedDB staat), niet meer', () => {
    const many = Array.from({ length: 260 }, (_, i) => newItem(`id-${i}`, THUMB))
    const q = parseQueue(JSON.stringify(many))
    expect(q).toHaveLength(250)
    expect(q.at(-1)?.id).toBe('id-249')
  })

  it('nakijken: mislukt en twijfel eerst, dan bezig, dan goed', () => {
    const err = { ...newItem('e', THUMB), status: 'error' as const }
    const unsure = withMatch(newItem('u', THUMB), rec({ confidence: 'medium' }), [cand('x')])
    const nomatch = withMatch(newItem('n', THUMB), rec(), [])
    const g = reviewGroups([ready('a'), newItem('w', THUMB), err, unsure, nomatch])
    expect(g.check.map((q) => q.id)).toEqual(['e', 'u', 'n'])
    expect(g.working.map((q) => q.id)).toEqual(['w'])
    expect(g.good.map((q) => q.id)).toEqual(['a'])
    // Uitvinken verplaatst een regel niet.
    expect(reviewGroups([{ ...ready('a'), include: false }]).good).toHaveLength(1)
  })

  it('twijfel tussen even goede kandidaten en dubbel gescande kaarten gaan naar nakijken', () => {
    const c = (key: string, score: number): Candidate => ({ ...cand(key), score })
    const tie = withMatch(newItem('t', THUMB), rec(), [c('en/pop5-5', 6), c('en/sv03.5-005', 6)])
    const clear = withMatch(newItem('k', THUMB), rec(), [c('en/sv03.5-005', 7.5), c('en/pop5-5', 6)])
    expect(isAmbiguous(tie)).toBe(true)
    expect(isAmbiguous(clear)).toBe(false)
    const holo = ready('h', 'en/sv04-209', { variant: 'holo' })
    const normal = ready('n', 'en/sv04-209', { variant: 'normal' })
    expect([...scannedTwice([holo, normal, ready('x', 'en/sv03.5-025')])].sort()).toEqual(['h', 'n'])
    const g = reviewGroups([tie, clear, holo, normal])
    expect(g.check.map((q) => q.id)).toEqual(['t', 'h', 'n'])
    expect(g.good.map((q) => q.id)).toEqual(['k'])
  })

  it('alleen op set + nummer gekoppeld (geen kaartdata): nakijken, en blijft zo na herladen', () => {
    const loose = withMatch(newItem('j', THUMB), rec({ language: 'ja' }), [{ ...cand('ja/S4a-016'), noCardData: true }])
    expect(withoutCardData(loose)).toBe(true)
    expect(reviewGroups([loose]).check.map((q) => q.id)).toEqual(['j'])
    const [restored] = parseQueue(JSON.stringify([loose]))
    expect(withoutCardData(restored)).toBe(true)
    expect(withoutCardData(ready('a'))).toBe(false)
  })

  it('uitvoering past bij de catalogus; prijsverschil per uitvoering → nakijken, ook na herladen', () => {
    const facts = (variants: Variant[] | null, askVariant = false) => ({ variants, askVariant })
    expect(withMatch(newItem('x', THUMB), rec({ variant: 'reverse' }), [cand('en/sv03.5-151')], facts(['holo'])).variant).toBe('holo')
    expect(withMatch(newItem('x', THUMB), rec({ variant: 'holo' }), [cand('en/sv03.5-149')], facts(['normal', 'reverse'])).variant).toBe(null)
    expect(withMatch(newItem('x', THUMB), rec({ variant: 'reverse' }), [cand('en/sv03.5-149')], facts(['normal', 'reverse'])).variant).toBe('reverse')
    const ask = withMatch(newItem('v', THUMB), rec({ variant: 'holo' }), [cand('en/sv03.5-149')], facts(['holo', 'reverse'], true))
    expect(ask).toMatchObject({ variant: 'holo', askVariant: true, include: true })
    expect(reviewGroups([ask, ready('a')]).check.map((q) => q.id)).toEqual(['v'])
    expect(parseQueue(JSON.stringify([ask]))[0].askVariant).toBe(true)
    // Opnieuw gezocht zonder prijsverschil: vlag weg.
    expect(withMatch(ask, rec(), [cand('en/sv03.5-025')], facts(['normal'])).askVariant).toBeUndefined()
    // Geen automatische keuze: uitvoeringen van een suggestie tellen niet.
    const other = withMatch(newItem('o', THUMB), rec({ variant: 'reverse' }), [{ ...cand('x'), otherNumber: true }], facts(['holo'], true))
    expect(other).toMatchObject({ variant: 'reverse' })
    expect(other.askVariant).toBeUndefined()
  })

  it('alleen suggesties met een ander nummer: niets gekozen of aangevinkt, nakijken, en blijft zo na herladen', () => {
    const other = (key: string): Candidate => ({ ...cand(key), score: 3, otherNumber: true })
    const guess = withMatch(newItem('d', THUMB), rec({ language: 'zh-cn', setCode: 'CSMC', cardNumber: '004' }), [other('zh-cn/SV8-055'), other('zh-cn/SV9-040')])
    expect(guess).toMatchObject({ chosen: '', include: false })
    expect(onlyOtherNumbers(guess)).toBe(true)
    expect(reviewGroups([guess, ready('a')]).check.map((q) => q.id)).toEqual(['d'])
    // Zonder koppeling niet samenvoegen met een andere regel zonder koppeling.
    expect(mergeDuplicate([withMatch(newItem('e', THUMB), rec(), [other('x')]), guess], 'd')).toHaveLength(2)
    const [restored] = parseQueue(JSON.stringify([guess]))
    expect(onlyOtherNumbers(restored)).toBe(true)
    expect(onlyOtherNumbers(ready('a'))).toBe(false)
    expect(onlyOtherNumbers(withMatch(newItem('n', THUMB), rec(), []))).toBe(false)
  })
})

describe('stripCandidates', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map(cand)
  it('de beste drie; een elders gekozen kaart neemt de laatste plek', () => {
    expect(stripCandidates(list, '').map((c) => c.key)).toEqual(['a', 'b', 'c'])
    expect(stripCandidates(list, 'b').map((c) => c.key)).toEqual(['a', 'b', 'c'])
    expect(stripCandidates(list, 'e').map((c) => c.key)).toEqual(['a', 'b', 'e'])
    expect(stripCandidates(list.slice(0, 1), 'x').map((c) => c.key)).toEqual(['a'])
  })
})
