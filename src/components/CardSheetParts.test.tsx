// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CardFacts, Fold } from './CardSheetParts'

afterEach(cleanup)

describe('kaartpopup-onderdelen', () => {
  it('inklapblok maakt de inhoud pas als je hem opent (geen onnodige verzoeken)', async () => {
    render(
      <Fold title="Prices" hint="Sources and price history">
        <p>Price chart</p>
      </Fold>,
    )
    expect(screen.queryByText('Price chart')).toBeNull()
    await userEvent.click(screen.getByText('Prices'))
    await waitFor(() => expect(screen.getByText('Price chart')).toBeTruthy())
  })

  it('feitenkolom: label en waarde als lijst', () => {
    render(<CardFacts facts={[{ label: 'Condition', value: 'Near Mint' }, { label: 'Paid', value: '–' }]} />)
    const terms = screen.getAllByRole('term').map((t) => t.textContent)
    expect(terms).toEqual(['Condition', 'Paid'])
    expect(screen.getByText('Near Mint')).toBeTruthy()
  })
})
