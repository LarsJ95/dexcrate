import { describe, expect, it, vi } from 'vitest'
import { setTorch, torchSupported, trackHasTorch } from './torch'

describe('torchSupported', () => {
  it('spec: lijst booleans met true; ook één boolean true', () => {
    expect(torchSupported({ torch: [true, false] })).toBe(true)
    expect(torchSupported({ torch: [false, true] })).toBe(true)
    expect(torchSupported({ torch: true })).toBe(true)
  })

  it('niet te bedienen of onbekend: nee', () => {
    expect(torchSupported({ torch: [false] })).toBe(false)
    expect(torchSupported({ torch: false })).toBe(false)
    expect(torchSupported({ width: { min: 1, max: 4000 } })).toBe(false)
    expect(torchSupported(null)).toBe(false)
    expect(torchSupported(undefined)).toBe(false)
  })
})

describe('trackHasTorch', () => {
  it('zonder track of zonder getCapabilities: nee', () => {
    expect(trackHasTorch(undefined)).toBe(false)
    expect(trackHasTorch({} as MediaStreamTrack)).toBe(false)
    expect(trackHasTorch({ getCapabilities: () => ({ torch: [true, false] }) } as unknown as MediaStreamTrack)).toBe(true)
  })
})

describe('setTorch', () => {
  it('stuurt de torch-constraint als advanced', async () => {
    const applyConstraints = vi.fn(() => Promise.resolve())
    await setTorch({ applyConstraints } as unknown as MediaStreamTrack, true)
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  })
})
