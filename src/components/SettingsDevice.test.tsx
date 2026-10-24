// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/chsCatalog', () => ({
  CHS_DOWNLOAD_MB: 9,
  downloadChsCatalog: vi.fn(),
  removeChsCatalog: vi.fn(),
  useChsCatalog: () => ({ kind: 'none' }),
}))

const { ScanningGroup } = await import('./SettingsDevice')
const { setPref } = await import('../lib/devicePrefs')

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Settings → Scanning (24-10-2026, beknopte lijst)', () => {
  it('pauze tussen foto’s alleen zichtbaar met Auto capture aan', () => {
    act(() => setPref('autoCapture', false))
    render(<ScanningGroup />)
    expect(screen.queryByRole('group', { name: 'Time between photos' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /Auto capture/ }))
    expect(screen.getByRole('group', { name: 'Time between photos' })).toBeTruthy()
  })

  it('zelden nodig staat ingeklapt met een korte stand in de regel', () => {
    render(<ScanningGroup />)
    const chinese = screen.getByText('Chinese cards').closest('details')
    expect(chinese?.open).toBe(false)
    expect(chinese?.querySelector('summary')?.textContent).toContain('Not downloaded')
    expect(screen.getByText('Camera check').closest('details')?.open).toBe(false)
  })
})
