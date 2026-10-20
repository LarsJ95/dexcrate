// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Candidate } from './match'

/**
 * Bewaarde wachtrij van vóór de naamcontrole (geen `matcher`): Abra stond gekoppeld aan 棄世猴 (SV8 #062).
 * Regel "b" heeft een zelf gekozen andere kaart en moet blijven zoals hij is.
 */
const stored = vi.hoisted(() => {
  const rec = (name: string) => ({ position: 1, namePrinted: '', nameEnglish: name, language: 'zh-cn', setCode: 'SV8', cardNumber: '062', setTotal: '', variant: 'normal', confidence: 'high', notes: '' })
  const wrong = { key: 'zh-cn/SV8-062', name: '棄世猴', localId: '062', setId: 'SV8', setName: '超電突圍', image: null, score: 8, reason: 'Set and number match' }
  const other = { ...wrong, key: 'zh-cn/SV8-001', name: '蛋蛋', localId: '001', score: 3 }
  const base = { thumb: 'data:image/jpeg;base64,AAAA', status: 'ready', error: null, quantity: 3, variant: 'normal', include: true, at: '2026-10-20T10:00:00.000Z' }
  return JSON.stringify([
    { ...base, id: 'a', rec: rec('Abra'), candidates: [wrong], chosen: wrong.key },
    { ...base, id: 'b', rec: rec('Abra'), candidates: [wrong, other], chosen: other.key },
  ])
})

vi.mock('./photoStore', () => ({
  loadQueueData: vi.fn(() => Promise.resolve(stored)),
  saveQueueData: vi.fn(() => Promise.resolve()),
  listPhotoIds: vi.fn(() => Promise.resolve([])),
  loadPhoto: vi.fn(() => Promise.resolve(null)),
  savePhoto: vi.fn(() => Promise.resolve()),
  deletePhotos: vi.fn(() => Promise.resolve()),
}))
vi.mock('./scan', async () => {
  const { scanQuery } = await import('./scanResult')
  return { scanQuery, recognizeCards: vi.fn(), prepareImage: vi.fn(), preparedFromBlob: vi.fn() }
})
const fixedList: Candidate[] = [{ key: 'zh-cn/SV8-062', name: '棄世猴', localId: '062', setId: 'SV8', setName: '超電突圍', image: null, score: 2, reason: 'Other card at this number: 棄世猴', nameDiffers: true }]
vi.mock('./match', async (importOriginal) => ({ ...(await importOriginal<typeof import('./match')>()), findScanCandidates: vi.fn(() => Promise.resolve(fixedList)) }))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } }))
vi.mock('./variantChoice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./variantChoice')>()),
  variantFacts: vi.fn(() => Promise.resolve(null)),
}))

const { MATCHER_VERSION } = await import('./scanQueue')
const { getQueue } = await import('./scanQueueStore')

describe('wachtrij na een betere zoekfunctie', () => {
  it('niet aangepaste regel wordt opnieuw opgezocht (niet meer gekoppeld); zelf gekozen kaart blijft', async () => {
    await vi.waitFor(() => expect(getQueue().map((q) => q.matcher)).toEqual([MATCHER_VERSION, MATCHER_VERSION]))
    const [a, b] = getQueue()
    expect(a).toMatchObject({ id: 'a', chosen: '', include: false, quantity: 3, candidates: fixedList })
    // Regel "b" niet opnieuw opgezocht: kandidaten en keuze zoals bewaard.
    expect(b).toMatchObject({ id: 'b', chosen: 'zh-cn/SV8-001', include: true })
    expect(b.candidates.map((c) => c.key)).toEqual(['zh-cn/SV8-062', 'zh-cn/SV8-001'])
  })
})
