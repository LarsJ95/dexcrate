/**
 * Zaklamp van de camera (W3C Image Capture, constraint `torch`). TypeScript kent `torch` alleen in
 * MediaTrackSettings, niet in getCapabilities()/applyConstraints(); daarom hier smal getypeerd.
 */

/**
 * Kan de zaklamp aan? Volgens de spec is capabilities.torch een lijst booleans (met `true` = aan kan);
 * sommige browsers melden één boolean. Onbekend of afwezig = nee.
 */
export function torchSupported(capabilities: unknown): boolean {
  if (typeof capabilities !== 'object' || capabilities === null) return false
  const torch = (capabilities as { torch?: unknown }).torch
  return torch === true || (Array.isArray(torch) && torch.includes(true))
}

/** Kan deze cameratrack de zaklamp bedienen? (getCapabilities ontbreekt in sommige browsers.) */
export function trackHasTorch(track: MediaStreamTrack | undefined): boolean {
  return Boolean(track && typeof track.getCapabilities === 'function' && torchSupported(track.getCapabilities()))
}

/** Zaklamp aan of uit (als "advanced" constraint, zoals de spec toestaat). */
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  const torch: MediaTrackConstraintSet & { torch: boolean } = { torch: on }
  await track.applyConstraints({ advanced: [torch] })
}

/**
 * Achtercamera's volgens het label (Chrome op Android: "camera2 0, facing back"). Telefoons met meerdere lenzen
 * geven elke lens apart; alleen de hoofdlens heeft meestal de zaklamp. Labels zijn er pas na toestemming.
 */
export function backCameras(devices: readonly Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]): string[] {
  return devices.filter((d) => d.kind === 'videoinput' && d.deviceId && /\b(back|rear|environment)\b/i.test(d.label)).map((d) => d.deviceId)
}

/** Per apparaat onthouden welke camera de zaklamp heeft, of dat geen enkele hem heeft (met tijdstip). */
const TORCH_CAMERA_KEY = 'dexcrate:torch-camera'
/** Geen zaklamp gevonden: zo lang niet opnieuw alle camera's proberen (dat geeft even een zwart beeld). */
const NO_TORCH_RETRY_MS = 14 * 24 * 60 * 60 * 1000

export type TorchMemory = { kind: 'camera'; deviceId: string } | { kind: 'none'; at: number } | null

export function readTorchMemory(): TorchMemory {
  try {
    const raw = localStorage.getItem(TORCH_CAMERA_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { deviceId, none } = v as { deviceId?: unknown; none?: unknown }
    if (typeof deviceId === 'string' && deviceId) return { kind: 'camera', deviceId }
    if (typeof none === 'number') return { kind: 'none', at: none }
    return null
  } catch {
    return null // geen opslag of onleesbaar: gewoon opnieuw zoeken
  }
}

export function writeTorchMemory(m: TorchMemory): void {
  try {
    if (!m) localStorage.removeItem(TORCH_CAMERA_KEY)
    else localStorage.setItem(TORCH_CAMERA_KEY, JSON.stringify(m.kind === 'camera' ? { deviceId: m.deviceId } : { none: m.at }))
  } catch (err) {
    console.warn('Zaklampcamera onthouden mislukt', err)
  }
}

/** Andere camera's proberen? Niet als er onlangs al gezocht is zonder resultaat. */
export function shouldSearchTorch(m: TorchMemory, now = Date.now()): boolean {
  return m?.kind !== 'none' || now - m.at > NO_TORCH_RETRY_MS
}
