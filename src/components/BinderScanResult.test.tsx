// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../lib/match'
import type { Recognition } from '../lib/scanResult'

const rec = (position: number, name: string, confidence: Recognition['confidence']): Recognition => ({
  position,
  namePrinted: '',
  nameEnglish: name,
  language: 'zh-cn',
  setCode: '',
  cardNumber: '062',
  setTotal: '',
  variant: 'normal',
  confidence,
  notes: '',
})
const cand = (key: string, name: string, localId: string, extra: Partial<Candidate> = {}): Candidate => ({ key, name, localId, setId: key.split('/')[1].split('-')[0], setName: '太晶盛聚', image: null, score: 6, reason: '', ...extra })

/** Binderfoto met twee kaarten: Abra met twijfel (alleen suggesties), Houndoom zeker. */
const FOUND: Record<string, Candidate[]> = {
  Abra: [cand('zh-cn/CSV7C-001', '凯西', '001', { otherNumber: true }), cand('zh-cn/CSV9C-002', '凯西', '002', { otherNumber: true })],
  Houndoom: [cand('zh-cn/CSV9.5C-107', '黑鲁加', '107')],
}

vi.mock('../lib/scanMemory', () => ({
  scanCandidates: (r: Recognition) => Promise.resolve(FOUND[r.nameEnglish] ?? []),
  recordChoices: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
// Formuliervelden zonder catalogus (geen netwerk in unit-tests).
vi.mock('../lib/scan', () => ({
  draftFromScan: (r: Recognition) => Promise.resolve({ name: r.nameEnglish }),
  scanName: (r: Recognition) => r.nameEnglish || r.namePrinted,
}))
vi.mock('../lib/variantChoice', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/variantChoice')>()), variantFacts: () => Promise.resolve({ variants: null, askVariant: false }) }))
vi.mock('../hooks/useCardInfo', () => ({ useCardInfo: () => null }))
vi.mock('../hooks/useCardPrice', () => ({ useCardPrice: () => null }))
vi.mock('./CatalogCardPicture', () => ({ CatalogKeyPicture: ({ fallback }: { fallback: unknown }) => fallback }))

const { BinderScanResult } = await import('./BinderScanResult')

afterEach(cleanup)

function renderResult() {
  const onEdit = vi.fn()
  render(
    <BinderScanResult
      recognitions={[rec(1, 'Abra', 'medium'), rec(2, 'Houndoom', 'high')]}
      ownedByKey={new Map()}
      nextSortOrder={0}
      onAdded={vi.fn()}
      onEdit={onEdit}
      done={new Set()}
      onCancel={vi.fn()}
    />,
  )
  return { onEdit }
}

const rowOf = (name: string): HTMLElement => {
  const li = screen.getAllByRole('listitem').find((el) => el.querySelector('.tile-name')?.textContent?.includes(name))
  if (!li) throw new Error(`geen regel voor ${name}`)
  return li
}

describe('BinderScanResult: compacte regel (B2)', () => {
  it('twijfel: kandidaten als foto\'s, gelezen waarden; kiezen vinkt aan en telt mee bij "Add"', async () => {
    renderResult()
    const abra = within(rowOf('Abra'))
    expect(await abra.findByRole('group', { name: 'Card for Abra' })).toBeTruthy()
    expect(abra.getByText('Read as #062 · Chinese (simplified) (uncertain)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add 1' })).toBeTruthy()
    await userEvent.click(abra.getByRole('button', { name: '凯西, 太晶盛聚 #002' }))
    expect(abra.getByRole('button', { name: '凯西, 太晶盛聚 #002', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add 2' })).toBeTruthy()
  })

  it('zeker: alleen de kaart; kandidaten en Edit achter "More"', async () => {
    const { onEdit } = renderResult()
    const hound = within(rowOf('Houndoom'))
    expect(await hound.findByText('太晶盛聚 #107')).toBeTruthy()
    expect(hound.queryByText(/Read as/)).toBe(null)
    expect(hound.queryByRole('group', { name: 'Card for Houndoom' })).toBe(null)
    await userEvent.click(hound.getByRole('button', { name: 'More' }))
    expect(hound.getByRole('group', { name: 'Card for Houndoom' })).toBeTruthy()
    await userEvent.click(hound.getByRole('button', { name: 'Edit' }))
    await vi.waitFor(() => expect(onEdit).toHaveBeenCalledOnce())
  })
})
