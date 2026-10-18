import { describe, expect, it } from 'vitest'
import type { Candidate } from './match'
import type { Recognition } from './scanResult'
import { isAmbiguous, mergeDuplicate, newItem, parseQueue, reviewGroups, scannedTwice, summarize, withMatch, withoutCardData, type QueueItem } from './scanQueue'

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
})
