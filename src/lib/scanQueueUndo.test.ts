// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Bewaarde wachtrij met twee herkende regels (nieuwste zoekversie, dus niet opnieuw opzoeken). */
const stored = vi.hoisted(() => {
  const rec = (name: string) => ({ position: 1, namePrinted: '', nameEnglish: name, language: 'en', setCode: 'MEW', cardNumber: '025', setTotal: '', variant: 'normal', confidence: 'high', notes: '' })
  const base = { thumb: 'data:image/jpeg;base64,AAAA', status: 'ready', error: null, candidates: [], chosen: '', quantity: 1, variant: 'normal', include: false, at: '2026-10-20T10:00:00.000Z', matcher: 999 }
  return JSON.stringify([
    { ...base, id: 'a', rec: rec('Pikachu') },
    { ...base, id: 'b', rec: rec('Raichu') },
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
vi.mock('./scan', () => ({ scanQuery: vi.fn(), recognizeCards: vi.fn(), prepareImage: vi.fn(), preparedFromBlob: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: {} }))

const { deletePhotos } = await import('./photoStore')
const { UNDO_MS, getQueue, getRemoved, removeWithUndo, undoRemove } = await import('./scanQueueStore')

afterEach(() => {
  vi.useRealTimers()
})

describe('scanregel weghalen met Undo (G1)', () => {
  it('weg uit de lijst, foto nog niet gewist; Undo zet hem terug op dezelfde plek', async () => {
    await vi.waitFor(() => expect(getQueue()).toHaveLength(2))
    removeWithUndo(['a'])
    expect(getQueue().map((q) => q.id)).toEqual(['b'])
    expect(getRemoved()).toEqual({ count: 1, label: 'Pikachu' })
    expect(vi.mocked(deletePhotos)).not.toHaveBeenCalledWith(['a'])
    undoRemove()
    expect(getQueue().map((q) => q.id)).toEqual(['a', 'b'])
    expect(getRemoved()).toBe(null)
  })

  it('na de wachttijd echt weg, mét foto', async () => {
    await vi.waitFor(() => expect(getQueue()).toHaveLength(2))
    vi.useFakeTimers()
    removeWithUndo(['b'])
    vi.advanceTimersByTime(UNDO_MS - 1)
    expect(vi.mocked(deletePhotos)).not.toHaveBeenCalledWith(['b'])
    vi.advanceTimersByTime(1)
    expect(vi.mocked(deletePhotos)).toHaveBeenCalledWith(['b'])
    expect(getRemoved()).toBe(null)
    undoRemove()
    expect(getQueue().map((q) => q.id)).toEqual(['a'])
  })
})
