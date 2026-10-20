// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { backCameras, browserCanControlTorch, isFirefox, photoFlash, readTorchMemory, setTorch, torchSupportOf, torchSupported, trackHasTorch, writeTorchMemory } from './torch'

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

})

describe('setTorch: controleren of hij echt aan ging', () => {
  it('browser meldt een andere stand: fout (dan zegt de knop waarom)', async () => {
    const track = { applyConstraints: vi.fn(() => Promise.resolve()), getSettings: () => ({ torch: false }) } as unknown as MediaStreamTrack
    await expect(setTorch(track, true)).rejects.toThrow()
    const ok = { applyConstraints: vi.fn(() => Promise.resolve()), getSettings: () => ({ torch: true }) } as unknown as MediaStreamTrack
    await expect(setTorch(ok, true)).resolves.toBeUndefined()
  })
})

describe('flitser via de foto-instellingen (Image Capture)', () => {
  const trackWith = (torch: boolean): MediaStreamTrack => ({ getCapabilities: () => (torch ? { torch: [true, false] } : {}) }) as unknown as MediaStreamTrack

  it('zonder Image Capture: geen flitser; met "flash": misschien', async () => {
    vi.stubGlobal('ImageCapture', undefined)
    expect(await photoFlash(trackWith(false))).toBe(false)
    expect(await torchSupportOf(trackWith(false))).toBe('no')
    vi.stubGlobal(
      'ImageCapture',
      class {
        getPhotoCapabilities() {
          return Promise.resolve({ fillLightMode: ['auto', 'off', 'flash'] })
        }
      },
    )
    expect(await torchSupportOf(trackWith(false))).toBe('maybe')
    expect(await torchSupportOf(trackWith(true))).toBe('yes')
    vi.unstubAllGlobals()
  })
})

describe('browser en zaklamp', () => {
  it('alleen met torch-constraint of Image Capture; Firefox herkend', () => {
    expect(browserCanControlTorch({ supported: { width: true, torch: true }, imageCapture: false })).toBe(true)
    expect(browserCanControlTorch({ supported: { width: true }, imageCapture: true })).toBe(true)
    // Firefox 158 op Android: geen van beide.
    expect(browserCanControlTorch({ supported: { width: true, facingMode: true }, imageCapture: false })).toBe(false)
    expect(isFirefox('Mozilla/5.0 (Android 16; Mobile; rv:158.0) Gecko/158.0 Firefox/158.0')).toBe(true)
    expect(isFirefox('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/148.0 Mobile Safari/537.36')).toBe(false)
  })
})
