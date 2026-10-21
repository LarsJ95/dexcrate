// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type JSX } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ListChoice } from './ListChoice'

afterEach(cleanup)

const lists = [
  { id: 'l10', name: '€10' },
  { id: 'l20', name: '€20' },
  { id: 'lb', name: 'Birthday' },
]

function Harness({ start = [] }: { start?: string[] }): JSX.Element {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(start))
  return (
    <>
      <ListChoice legend="Your lists" lists={lists} chosen={chosen} onChange={setChosen} />
      <output>{[...chosen].sort().join(',')}</output>
    </>
  )
}

const value = (): string => document.querySelector('output')?.textContent ?? ''

describe('ListChoice', () => {
  it('standaard één lijst: €10 kiezen zet €20 uit; "No list" haalt alles weg', async () => {
    render(<Harness />)
    expect((screen.getByRole('radio', { name: 'No list' }) as HTMLInputElement).checked).toBe(true)
    await userEvent.click(screen.getByRole('radio', { name: '€20' }))
    await userEvent.click(screen.getByRole('radio', { name: '€10' }))
    expect(value()).toBe('l10')
    await userEvent.click(screen.getByRole('radio', { name: 'No list' }))
    expect(value()).toBe('')
  })

  it('"Add to more lists": dan meerdere tegelijk; "Just one list" houdt de eerste', async () => {
    render(<Harness start={['l10']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add to more lists' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Birthday' }))
    expect(value()).toBe('l10,lb')
    await userEvent.click(screen.getByRole('button', { name: 'Just one list' }))
    expect(value()).toBe('l10')
    expect(screen.getByRole('radio', { name: '€10' })).toBeTruthy()
  })

  it('staat de wens al in meerdere lijsten, dan meteen meerdere (niets valt stil weg)', () => {
    render(<Harness start={['l10', 'l20']} />)
    expect((screen.getByRole('checkbox', { name: '€10' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: '€20' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
