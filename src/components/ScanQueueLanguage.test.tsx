// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem } from '../lib/scanQueue'
import type { Recognition } from '../lib/scanResult'

// 25-10-2026: een Engelse kaart (Jacinthe, POR 075) werd als Franse "Iono" opgeslagen.
const rec = (over: Partial<Recognition>): Recognition => ({
  position: 1,
  namePrinted: 'Jacinthe',
  nameEnglish: 'Iono',
  language: 'fr',
  setCode: 'POR',
  cardNumber: '075',
  setTotal: '088',
  variant: 'normal',
  confidence: 'high',
  notes: '',
  ...over,
})
const base = { thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', status: 'ready' as const, error: null, variant: 'normal' as const, at: '2026-10-25T10:00:00.000Z', matcher: 3, quantity: 1 }
const cand = { key: 'en/me03-075', name: 'Jacinthe', localId: '075', setId: 'me03', setName: 'Perfect Order', image: null, score: 8, reason: 'Set and number match' }
const QUEUE: QueueItem[] = [
  { ...base, id: 'a', rec: rec({}), candidates: [cand], chosen: cand.key, include: false },
  { ...base, id: 'b', rec: rec({ language: 'en', languageChecked: true, nameEnglish: 'Jacinthe' }), candidates: [{ ...cand, key: 'en/me03-076', localId: '076' }], chosen: 'en/me03-076', include: true },
]

vi.mock('../lib/scanQueueStore', () => ({
  subscribe: () => () => undefined,
  getQueue: () => QUEUE,
  getFeedback: () => null,
  undoFeedback: vi.fn(),
  updateItem: vi.fn(),
  removeItems: vi.fn(),
  removeWithUndo: vi.fn(),
  undoRemove: vi.fn(),
  getRemoved: () => null,
  canLookAgain: () => true,
  canRetry: () => false,
  lookAgain: vi.fn(),
  retry: vi.fn(),
  searchAgain: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useCardInfo', () => ({ useCardInfo: () => null }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: () => null }))
vi.mock('./CatalogCardPicture', () => ({ CatalogKeyPicture: ({ fallback }: { fallback: unknown }) => fallback }))

const { ScanQueue } = await import('./ScanQueue')

afterEach(cleanup)

describe('ScanQueue: taal en naam', () => {
  it('naam uit de catalogus; geraden Frans: waarschuwing en niet aangevinkt', () => {
    render(<ScanQueue ownedByKey={new Map()} nextSortOrder={0} defaultCondition={null} onAdded={vi.fn()} onEdit={vi.fn()} wished={new Set()} />)
    const boxes = screen.getAllByRole('checkbox', { name: 'Add Jacinthe' }) as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true])
    expect(screen.queryByText(/Iono/)).toBeNull()
    expect(screen.getAllByText('Read as a French card. Check the language, then tick the card to add it.')).toHaveLength(1)
  })
})
