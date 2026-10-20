// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../lib/match'
import type { QueueItem } from '../lib/scanQueue'
import type { Recognition } from '../lib/scanResult'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

const rec = (name: string): Recognition => ({ position: 1, namePrinted: '', nameEnglish: name, language: 'zh-cn', setCode: '', cardNumber: '062', setTotal: '', variant: 'normal', confidence: 'high', notes: '' })
const cand = (key: string, name: string, localId: string, extra: Partial<Candidate> = {}): Candidate => ({ key, name, localId, setId: 'CSV9.5C', setName: '太晶盛聚', image: null, score: 6, reason: '', ...extra })
const base = { thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', status: 'ready' as const, error: null, variant: 'normal' as const, at: '2026-10-20T10:00:00.000Z', matcher: 3 }

/** Twijfel (Abra: alleen suggesties met een ander nummer) en zeker (Houndoom). */
const QUEUE: QueueItem[] = [
  {
    ...base,
    id: 'a',
    rec: rec('Abra'),
    candidates: [cand('zh-cn/CSV7C-001', '凯西', '001', { otherNumber: true }), cand('zh-cn/CSV8C-002', '凯西', '002', { otherNumber: true }), cand('zh-cn/CSV9C-003', '凯西', '003', { otherNumber: true }), cand('zh-cn/CSV10C-004', '凯西', '004', { otherNumber: true })],
    chosen: '',
    quantity: 1,
    include: false,
  },
  { ...base, id: 'b', rec: rec('Houndoom'), candidates: [cand('zh-cn/CSV9.5C-107', '黑鲁加', '107')], chosen: 'zh-cn/CSV9.5C-107', quantity: 2, include: true },
]

const store = vi.hoisted(() => ({ updateItem: vi.fn(), removeItems: vi.fn() }))
vi.mock('../lib/scanQueueStore', () => ({
  subscribe: () => () => undefined,
  getQueue: () => QUEUE,
  getFeedback: () => null,
  undoFeedback: vi.fn(),
  updateItem: store.updateItem,
  removeItems: store.removeItems,
  canLookAgain: () => true,
  canRetry: () => false,
  lookAgain: vi.fn(),
  retry: vi.fn(),
  searchAgain: vi.fn(),
}))
// Geen netwerk in unit-tests: kaartinfo, prijzen en foto's leeg.
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../hooks/useCardInfo', () => ({ useCardInfo: () => null }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: () => null }))
vi.mock('./CatalogCardPicture', () => ({ CatalogKeyPicture: ({ fallback }: { fallback: unknown }) => fallback }))

const { ScanQueue } = await import('./ScanQueue')

beforeEach(() => {
  store.updateItem.mockClear()
  store.removeItems.mockClear()
})
afterEach(cleanup)

const renderQueue = () =>
  render(<ScanQueue ownedByKey={new Map()} nextSortOrder={0} defaultCondition={null} onAdded={vi.fn()} onEdit={vi.fn()} wished={new Set()} />)

const rowOf = (name: string): HTMLElement => {
  const li = screen.getAllByRole('listitem').find((el) => el.querySelector('.tile-name')?.textContent?.includes(name))
  if (!li) throw new Error(`geen regel voor ${name}`)
  return li
}

describe('ScanQueue: compacte scanregel', () => {
  it('twijfel: kandidaten als foto\'s; tikken kiest de kaart en vinkt hem aan', async () => {
    renderQueue()
    const abra = within(rowOf('Abra'))
    const group = abra.getByRole('group', { name: 'Card for Abra' })
    expect(within(group).getAllByRole('button', { name: /凯西/ })).toHaveLength(3)
    expect(within(group).getByRole('button', { name: 'No link', pressed: true })).toBeTruthy()
    await userEvent.click(within(group).getByRole('button', { name: '凯西, 太晶盛聚 #002' }))
    expect(store.updateItem).toHaveBeenLastCalledWith('a', { chosen: 'zh-cn/CSV8C-002', include: true })
    // Vierde kandidaat via "More…".
    await userEvent.selectOptions(abra.getByRole('combobox', { name: 'All matches for Abra' }), 'zh-cn/CSV10C-004')
    expect(store.updateItem).toHaveBeenLastCalledWith('a', { chosen: 'zh-cn/CSV10C-004', include: true })
  })

  it('zekere match: geen kandidaten en acties tot "More"', async () => {
    renderQueue()
    const hound = within(rowOf('Houndoom'))
    expect(hound.getByText('太晶盛聚 #107')).toBeTruthy()
    // Geen marktprijs (Chinese kaart): geen losse "–" in de regel.
    expect(rowOf('Houndoom').querySelector('.queue-meta')?.textContent).not.toContain('–')
    // Zeker: geen "Read as …"; bij twijfel wel (S5).
    expect(hound.queryByText(/Read as/)).toBe(null)
    expect(within(rowOf('Abra')).getByText('Read as #062 · Chinese (simplified)')).toBeTruthy()
    expect(hound.queryByRole('group', { name: 'Card for Houndoom' })).toBe(null)
    expect(hound.queryByRole('button', { name: 'Correct' })).toBe(null)
    await userEvent.click(hound.getByRole('button', { name: 'More' }))
    expect(hound.getByRole('group', { name: 'Card for Houndoom' })).toBeTruthy()
    expect(hound.getByRole('button', { name: 'Correct' })).toBeTruthy()
    expect(hound.getByRole('button', { name: 'Look again' })).toBeTruthy()
  })

  it('aantal met − en +, × haalt de regel weg', async () => {
    renderQueue()
    const hound = within(rowOf('Houndoom'))
    await userEvent.click(hound.getByRole('button', { name: 'One more' }))
    expect(store.updateItem).toHaveBeenLastCalledWith('b', { quantity: 3 })
    await userEvent.click(hound.getByRole('button', { name: 'One less' }))
    expect(store.updateItem).toHaveBeenLastCalledWith('b', { quantity: 1 })
    await userEvent.click(hound.getByRole('button', { name: 'Remove Houndoom' }))
    expect(store.removeItems).toHaveBeenLastCalledWith(['b'])
  })

  it('foto\'s aantikken: jouw foto en de kaart groot naast elkaar', async () => {
    renderQueue()
    await userEvent.click(within(rowOf('Houndoom')).getByRole('button', { name: 'Compare your photo of Houndoom with the card' }))
    const dialog = screen.getByRole('dialog', { name: 'Houndoom' })
    expect(within(dialog).getByAltText('Your photo')).toBeTruthy()
    expect(within(dialog).getByText('黑鲁加 · 太晶盛聚 #107')).toBeTruthy()
  })

  it('onderbalk op één regel; Clear vraagt eerst', async () => {
    renderQueue()
    expect(screen.getByRole('button', { name: 'Add 2' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Clear all 2 scans?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(store.removeItems).toHaveBeenLastCalledWith(['a', 'b'])
  })
})
