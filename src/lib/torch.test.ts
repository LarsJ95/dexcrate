// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { backCameras, readTorchMemory, setTorch, shouldSearchTorch, torchSupported, trackHasTorch, writeTorchMemory } from './torch'

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

describe('backCameras', () => {
  it('alleen achtercamera\'s met label (Android: een per lens)', () => {
    const cam = (deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput') => ({ deviceId, label, kind })
    const list = [cam('f', 'camera2 1, facing front'), cam('b0', 'camera2 0, facing back'), cam('b2', 'camera2 2, facing back'), cam('m', 'Mic', 'audioinput'), cam('r', 'Back Camera'), cam('x', '')]
    expect(backCameras(list)).toEqual(['b0', 'b2', 'r'])
  })
})

describe('zaklampcamera onthouden', () => {
  it('camera of "geen" met tijdstip; onleesbaar = opnieuw zoeken', () => {
    writeTorchMemory({ kind: 'camera', deviceId: 'b0' })
    expect(readTorchMemory()).toEqual({ kind: 'camera', deviceId: 'b0' })
    writeTorchMemory({ kind: 'none', at: 1000 })
    expect(readTorchMemory()).toEqual({ kind: 'none', at: 1000 })
    localStorage.setItem('dexcrate:torch-camera', '{kapot')
    expect(readTorchMemory()).toBe(null)
    writeTorchMemory(null)
    expect(readTorchMemory()).toBe(null)
  })

  it('niet steeds opnieuw zoeken als geen camera een zaklamp heeft (14 dagen)', () => {
    const day = 24 * 60 * 60 * 1000
    expect(shouldSearchTorch(null)).toBe(true)
    expect(shouldSearchTorch({ kind: 'camera', deviceId: 'b0' })).toBe(true)
    expect(shouldSearchTorch({ kind: 'none', at: 0 }, 13 * day)).toBe(false)
    expect(shouldSearchTorch({ kind: 'none', at: 0 }, 15 * day)).toBe(true)
  })
})
