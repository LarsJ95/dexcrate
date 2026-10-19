// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Candidate } from './match'
import type { Recognition } from './scanResult'

/** Bewaarde wachtrij: één nagekeken regel (Dedenne CSMC 004, alleen een suggestie met een ander nummer). */
const stored = vi.hoisted(() => {
  const rec = {
    position: 1,
    namePrinted: '咚咚鼠',
    nameEnglish: 'Dedenne',
    language: 'zh-cn',
    setCode: 'CSMC',
    cardNumber: '004',
    setTotal: '012',
    variant: 'holo',
    confidence: 'high',
    notes: '',
  }
  const guess = { key: 'zh-cn/SV8-055', name: '咚咚鼠', localId: '055', setId: 'SV8', setName: '超電突圍', image: null, score: 3, reason: '', otherNumber: true }
  const item = { id: 'a', thumb: 'data:image/jpeg;base64,AAAA', status: 'ready', error: null, rec, candidates: [guess], chosen: '', quantity: 2, variant: 'holo', include: false, at: '2026-10-19T10:00:00.000Z' }
  return JSON.stringify([item])
})

vi.mock('./photoStore', () => ({
  loadQueueData: vi.fn(() => Promise.resolve(stored)),
  saveQueueData: vi.fn(() => Promise.resolve()),
  listPhotoIds: vi.fn(() => Promise.resolve([])),
  loadPhoto: vi.fn(() => Promise.resolve(null)),
  savePhoto: vi.fn(() => Promise.resolve()),
  deletePhotos: vi.fn(() => Promise.resolve()),
}))
// scan.ts laadt de Supabase-client; hier alleen scanQuery nodig.
vi.mock('./scan', async () => {
  const { scanQuery } = await import('./scanResult')
  return { scanQuery, recognizeCards: vi.fn(), prepareImage: vi.fn(), preparedFromBlob: vi.fn() }
})
vi.mock('./match', async (importOriginal) => ({ ...(await importOriginal<typeof import('./match')>()), findScanCandidates: vi.fn() }))

const { findScanCandidates } = await import('./match')
const { getQueue, removeItems, searchAgain } = await import('./scanQueueStore')

const fixed = (over: Partial<Recognition> = {}): Recognition => ({ ...(JSON.parse(stored) as { rec: Recognition }[])[0].rec, setCode: 'S12', cardNumber: '045', setTotal: '098', language: 'zh-tw', ...over })
const match: Candidate = { key: 'zh-tw/S12-045', name: '咚咚鼠', localId: '045', setId: 'S12', setName: '思維激盪', image: null, score: 8, reason: 'Set and number match' }

describe('Quick scan: opnieuw zoeken met verbeterde waarden', () => {
  it('mislukt zoeken: regel blijft zoals hij was en de fout gaat naar het formulier', async () => {
    await vi.waitFor(() => expect(getQueue()).toHaveLength(1))
    const before = getQueue()[0]
    vi.mocked(findScanCandidates).mockRejectedValueOnce(new Error('TCGdex 502'))
    await expect(searchAgain('a', fixed())).rejects.toThrow('TCGdex 502')
    expect(getQueue()[0]).toBe(before)
  })

  it('gevonden: nieuwe kandidaten, gekozen en aangevinkt; aantal blijft', async () => {
    vi.mocked(findScanCandidates).mockResolvedValueOnce([match])
    await searchAgain('a', fixed())
    expect(vi.mocked(findScanCandidates)).toHaveBeenLastCalledWith({ name: 'Dedenne', set_code: 'S12', card_number: '045', set_total: '098' }, 'zh-tw')
    expect(getQueue()[0]).toMatchObject({ id: 'a', status: 'ready', chosen: 'zh-tw/S12-045', include: true, quantity: 2, rec: { setCode: 'S12', language: 'zh-tw' } })
  })

  it('regel intussen weg: niets terugzetten', async () => {
    let finish: (c: Candidate[]) => void = () => {}
    vi.mocked(findScanCandidates).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const pending = searchAgain('a', fixed({ cardNumber: '046' }))
    removeItems(['a'])
    finish([match])
    await pending
    expect(getQueue()).toHaveLength(0)
  })
})
