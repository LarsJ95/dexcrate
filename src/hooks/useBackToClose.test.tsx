// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState, type JSX, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useBackToClose } from './useBackToClose'

function Popup({ name, onClose, children }: { name: string; onClose: () => void; children?: ReactNode }): JSX.Element {
  useBackToClose(onClose)
  return (
    <div role="dialog" aria-label={name}>
      <button type="button" onClick={onClose}>
        Close {name}
      </button>
      {children}
    </div>
  )
}

/** Buitenste popup met eventueel een binnenste erin, zoals een wishlist-venster in een kaartvenster. */
function Harness(): JSX.Element {
  const [outerOpen, setOuterOpen] = useState(true)
  const [innerOpen, setInnerOpen] = useState(false)
  if (!outerOpen) return <p>page</p>
  return (
    <Popup name="outer" onClose={() => setOuterOpen(false)}>
      <button type="button" onClick={() => setInnerOpen(true)}>
        Open inner
      </button>
      {innerOpen && <Popup name="inner" onClose={() => setInnerOpen(false)} />}
    </Popup>
  )
}

/** Binnenste popup gaat (zoals in de app) pas open na een tik in de buitenste. */
function renderNested(): void {
  render(<Harness />)
  act(() => screen.getByRole('button', { name: 'Open inner' }).click())
}

const tick = (): Promise<void> => act(() => new Promise<void>((r) => setTimeout(r, 20)))
const back = async (): Promise<void> => {
  window.history.back()
  await tick()
}
const isOpen = (name: string): boolean => screen.queryByRole('dialog', { name }) !== null

afterEach(async () => {
  cleanup()
  await tick()
  window.history.replaceState(null, '', '#/collection')
})

describe('useBackToClose', () => {
  it('terug sluit de popup en blijft op dezelfde pagina', async () => {
    window.location.hash = '#/collection'
    await tick()
    render(<Harness />)
    expect(window.history.state).not.toBeNull()
    await back()
    expect(isOpen('outer')).toBe(false)
    expect(window.location.hash).toBe('#/collection')
    // jsdom geeft na een hash-navigatie undefined i.p.v. null.
    expect(window.history.state ?? null).toBeNull()
  })

  it('sluiten met de knop haalt de eigen stap weer uit de geschiedenis', async () => {
    render(<Harness />)
    act(() => screen.getByRole('button', { name: 'Close outer' }).click())
    await tick()
    await waitFor(() => expect(window.history.state).toBeNull())
    expect(screen.getByText('page')).toBeTruthy()
  })

  it('sluit geneste popups één voor één', async () => {
    renderNested()
    await back()
    expect(isOpen('inner')).toBe(false)
    expect(isOpen('outer')).toBe(true)
    await back()
    expect(isOpen('outer')).toBe(false)
    expect(window.history.state).toBeNull()
  })

  it('ruimt beide stappen op als de buitenste popup met de binnenste erin sluit', async () => {
    renderNested()
    act(() => screen.getByRole('button', { name: 'Close outer' }).click())
    await tick()
    await waitFor(() => expect(window.history.state).toBeNull())
    // Daarna werkt terug weer gewoon (wordt niet als eigen stap genegeerd).
    expect(screen.getByText('page')).toBeTruthy()
  })

  it('laat de geschiedenis met rust als je vanuit de popup naar een andere pagina gaat', async () => {
    const { unmount } = render(<Harness />)
    window.location.hash = '#/sets'
    await tick()
    unmount()
    await tick()
    expect(window.location.hash).toBe('#/sets')
  })
})
