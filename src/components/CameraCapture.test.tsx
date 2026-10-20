// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTorchMemory, writeTorchMemory } from '../lib/torch'
import { CameraCapture } from './CameraCapture'

/**
 * Nagebootste telefoon met twee achterlenzen (zoals Chrome op Android ze toont): "b2" (groothoek, geen flitser)
 * opent standaard, "b0" (hoofdlens) heeft de zaklamp.
 */
let trackNo = 0

function fakeTrack(deviceId: string, torch: boolean): MediaStreamTrack {
  trackNo += 1
  return {
    id: `${deviceId}-${trackNo}`,
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    getCapabilities: () => (torch ? { torch: [true, false] } : {}),
    applyConstraints: vi.fn(() => Promise.resolve()),
  } as unknown as MediaStreamTrack
}

function fakeStream(deviceId: string, torch: boolean): MediaStream {
  const track = fakeTrack(deviceId, torch)
  return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
}

const getUserMedia = vi.fn((c: MediaStreamConstraints) => {
  const exact = typeof c.video === 'object' ? (c.video.deviceId as { exact?: string } | undefined)?.exact : undefined
  const id = exact ?? 'b2'
  return Promise.resolve(fakeStream(id, id === 'b0'))
})

beforeEach(() => {
  localStorage.clear()
  getUserMedia.mockClear()
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      // Chrome-achtig: kent de zaklamp-constraint.
      getSupportedConstraints: () => ({ width: true, facingMode: true, torch: true }),
      enumerateDevices: () =>
        Promise.resolve([
          { kind: 'videoinput', deviceId: 'f1', label: 'camera2 1, facing front' },
          { kind: 'videoinput', deviceId: 'b2', label: 'camera2 2, facing back' },
          { kind: 'videoinput', deviceId: 'b0', label: 'camera2 0, facing back' },
        ]),
    },
  })
})
afterEach(cleanup)

const renderCamera = () => render(<CameraCapture wide={false} onCapture={vi.fn()} onPickFile={vi.fn()} onClose={vi.fn()} />)

/** Beeld loopt (jsdom speelt geen video af). */
async function videoRuns(): Promise<void> {
  const video = document.querySelector('video')
  if (!video) throw new Error('geen video')
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
  fireEvent.loadedData(video)
}

describe('zaklamp', () => {
  it('lens zonder flitser: andere achterlens met zaklamp gekozen en onthouden', async () => {
    renderCamera()
    await videoRuns()
    await waitFor(() => expect(readTorchMemory()).toEqual({ kind: 'camera', deviceId: 'b0' }), { timeout: 4000 })
    fireEvent.loadedData(document.querySelector('video') as HTMLVideoElement)
    expect(await screen.findByRole('button', { name: 'Flashlight' })).toBeTruthy()
    // Voorcamera niet geprobeerd.
    expect(getUserMedia.mock.calls.some(([c]) => JSON.stringify(c).includes('f1'))).toBe(false)
  })

  it('volgende keer meteen de onthouden lens; zaklamp zonder zoeken', async () => {
    writeTorchMemory({ kind: 'camera', deviceId: 'b0' })
    renderCamera()
    await videoRuns()
    expect(await screen.findByRole('button', { name: 'Flashlight' })).toBeTruthy()
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(JSON.stringify(getUserMedia.mock.calls[0][0])).toContain('"exact":"b0"')
  })

  it('onlangs al gezocht zonder resultaat: niet vanzelf lenzen proberen; knop staat er wel, met uitleg bij tikken', async () => {
    writeTorchMemory({ kind: 'none', at: Date.now() })
    renderCamera()
    await videoRuns()
    const button = await screen.findByRole('button', { name: 'Flashlight (not available on this lens)' }, { timeout: 4000 })
    expect(getUserMedia).toHaveBeenCalledOnce()
    // Tikken: deze sessie nog niet gezocht en er zijn meer achterlenzen → nu wel zoeken (op verzoek).
    fireEvent.click(button)
    await waitFor(() => expect(readTorchMemory()).toEqual({ kind: 'camera', deviceId: 'b0' }), { timeout: 4000 })
  })

  it('meer dan één achterlens: lensknop wisselt en onthoudt de lens', async () => {
    writeTorchMemory({ kind: 'camera', deviceId: 'b0' })
    renderCamera()
    await videoRuns()
    const lens = await screen.findByRole('button', { name: /Switch lens/ })
    fireEvent.click(lens)
    await waitFor(() => expect(readTorchMemory()).toEqual({ kind: 'camera', deviceId: 'b2' }))
  })

  it('browser zonder zaklampbediening (Firefox): niet vanzelf lenzen proberen, tikken legt uit', async () => {
    Object.defineProperty(navigator.mediaDevices, 'getSupportedConstraints', { configurable: true, value: () => ({ width: true, facingMode: true }) })
    renderCamera()
    await videoRuns()
    const button = await screen.findByRole('button', { name: 'Flashlight (not available on this lens)' }, { timeout: 4000 })
    fireEvent.click(button)
    expect(await screen.findByRole('status')).toBeTruthy()
    // Alleen de eerste lens geopend; geen zoektocht langs de andere.
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(readTorchMemory()).toBe(null)
  })
})
