// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type JSX } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SearchClear } from './SearchClear'

afterEach(cleanup)

function Field(): JSX.Element {
  const [q, setQ] = useState('')
  return (
    <div className="search">
      <input type="search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <SearchClear value={q} onClear={() => setQ('')} />
    </div>
  )
}

describe('SearchClear', () => {
  it('pas zichtbaar na typen; één tik maakt het veld leeg en zet de cursor terug', async () => {
    render(<Field />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    const input = screen.getByLabelText('Search') as HTMLInputElement
    await userEvent.type(input, 'Pikachu')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })
})
