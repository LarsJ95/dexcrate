// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type JSX } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// CatalogFilterFields haalt (indirect) de Supabase-client binnen; die is hier niet nodig.
vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { CollectionFilterPanel } = await import('./CollectionFilterPanel')
const { NO_EXTRA_FILTERS } = await import('../lib/collectionFilters')
type ExtraFilters = typeof NO_EXTRA_FILTERS

afterEach(cleanup)

function Harness({ onState, canClear = false, onClear = () => {} }: { onState: (f: ExtraFilters) => void; canClear?: boolean; onClear?: () => void }): JSX.Element {
  const [extra, setExtra] = useState<ExtraFilters>(NO_EXTRA_FILTERS)
  onState(extra)
  return (
    <CollectionFilterPanel
      toolbar={null}
      extra={extra}
      setExtra={setExtra}
      setOptions={[
        { key: 'en/sv03.5', label: '151 (MEW)' },
        { key: 'en/swsh10', label: 'Astral Radiance (ASR)' },
      ]}
      activeCount={0}
      canClear={canClear}
      onClear={onClear}
    />
  )
}

describe('CollectionFilterPanel', () => {
  it('zet set, taal en koppeling in de filters', async () => {
    let state: ExtraFilters = NO_EXTRA_FILTERS
    render(<Harness onState={(f) => (state = f)} />)
    await userEvent.selectOptions(screen.getByLabelText('Set'), 'en/swsh10')
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ja')
    await userEvent.selectOptions(screen.getByLabelText('Linked card'), 'unlinked')
    expect(state.set).toBe('en/swsh10')
    expect(state.language).toBe('ja')
    expect(state.link).toBe('unlinked')
  })

  it('toont een opgeslagen set die niet meer in de lijst staat', () => {
    function Saved(): JSX.Element {
      const [extra, setExtra] = useState<ExtraFilters>({ ...NO_EXTRA_FILTERS, set: 'en/base1' })
      return <CollectionFilterPanel toolbar={null} extra={extra} setExtra={setExtra} setOptions={[]} activeCount={1} canClear onClear={() => {}} />
    }
    render(<Saved />)
    expect((screen.getByLabelText('Set') as HTMLSelectElement).value).toBe('en/base1')
  })

  it('"Clear all filters" alleen actief als er iets aan staat', async () => {
    const onClear = vi.fn()
    const { rerender } = render(<Harness onState={() => {}} onClear={onClear} />)
    expect((screen.getByRole('button', { name: 'Clear all filters' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<Harness onState={() => {}} canClear onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
