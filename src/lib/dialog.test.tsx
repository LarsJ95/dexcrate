// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onOwnClose } from './dialog'

afterEach(cleanup)

describe('onOwnClose', () => {
  it('sluiten van een geneste dialoog sluit de dialoog eromheen niet', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <dialog aria-label="outer" onClose={onOwnClose(outer)}>
        <dialog aria-label="inner" onClose={onOwnClose(inner)} />
      </dialog>,
    )
    fireEvent(screen.getByLabelText('inner'), new Event('close'))
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    fireEvent(screen.getByLabelText('outer'), new Event('close'))
    expect(outer).toHaveBeenCalledTimes(1)
  })
})
