// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom kent showModal niet.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

vi.mock('../lib/prints', () => ({
  getOtherPrints: () =>
    Promise.resolve([{ key: 'en/sv10-041', name: 'Gourgeist ex', setId: 'sv10', setName: 'Chaos Rising', localId: '041', image: null }]),
}))
vi.mock('./CatalogCardPicture', () => ({ CatalogKeyPicture: ({ alt, quality }: { alt: string; quality: string }) => <img alt={alt} data-quality={quality} /> }))

const { OtherPrints } = await import('./OtherPrints')

afterEach(cleanup)

describe('OtherPrints', () => {
  it('tikken op een print toont hem groot; de set staat er als aparte link onder', async () => {
    render(<OtherPrints cardKey="en/svp-200" />)
    const print = await screen.findByRole('button', { name: 'Show Gourgeist ex, Chaos Rising #041 large' })
    expect(screen.getByRole('link', { name: 'Open set ›' }).getAttribute('href')).toBe('#/sets/en/sv10')
    await userEvent.click(print)
    const zoom = screen.getByRole('dialog', { name: 'Gourgeist ex, Chaos Rising #041' })
    expect(within(zoom).getByAltText('Gourgeist ex, Chaos Rising #041').getAttribute('data-quality')).toBe('high')
  })
})
