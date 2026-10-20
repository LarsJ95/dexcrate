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

/**
 * Zaklamp aan of uit (als "advanced" constraint, zoals de spec toestaat). Meldt de browser daarna een andere stand,
 * dan is het niet gelukt: fout, zodat de knop dat kan zeggen in plaats van niets te doen.
 */
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  const torch: MediaTrackConstraintSet & { torch: boolean } = { torch: on }
  await track.applyConstraints({ advanced: [torch] })
  const now = typeof track.getSettings === 'function' ? (track.getSettings() as { torch?: unknown }).torch : undefined
  if (typeof now === 'boolean' && now !== on) throw new Error('The flashlight did not switch.')
}

/**
 * Kan deze browser een zaklamp überhaupt bedienen? Alleen als hij de constraint `torch` kent of Image Capture heeft.
 * Firefox heeft geen van beide (gemeten 20-10-2026 met de cameracheck op Firefox 158 / Android 16: geen torch op
 * 6 lenzen; MDN: Image Capture in Firefox alleen achter een vlag). Dan is zoeken naar een andere lens zinloos.
 */
export function browserCanControlTorch(env: { supported?: Record<string, unknown> | null; imageCapture: boolean }): boolean {
  return env.supported?.torch === true || env.imageCapture
}

/** Huidige browser (zie browserCanControlTorch). */
export function thisBrowserCanControlTorch(): boolean {
  const supported = typeof navigator.mediaDevices?.getSupportedConstraints === 'function' ? (navigator.mediaDevices.getSupportedConstraints() as Record<string, unknown>) : null
  return browserCanControlTorch({ supported, imageCapture: typeof (globalThis as { ImageCapture?: unknown }).ImageCapture === 'function' })
}

/** Firefox (ook op Android): de browser die de zaklamp niet laat bedienen; dan noemt de melding Chrome. */
export const isFirefox = (userAgent: string): boolean => /\bFirefox\//.test(userAgent)

type PhotoCapabilitiesLike = { fillLightMode?: unknown }
type ImageCaptureCtor = new (track: MediaStreamTrack) => { getPhotoCapabilities(): Promise<PhotoCapabilitiesLike> }

/**
 * Heeft deze lens een flitser volgens de foto-instellingen (Image Capture, `fillLightMode` "flash" of "auto")?
 * Sommige toestellen melden `torch` in de track pas nadat dit is opgevraagd, of helemaal niet; dan is de flitser
 * hier wel te zien en kan de zaklamp toch lukken. Zonder Image Capture (Safari, Firefox): nee.
 */
export async function photoFlash(track: MediaStreamTrack): Promise<boolean> {
  const IC = (globalThis as { ImageCapture?: ImageCaptureCtor }).ImageCapture
  if (typeof IC !== 'function') return false
  try {
    const caps = await new IC(track).getPhotoCapabilities()
    const modes = Array.isArray(caps.fillLightMode) ? caps.fillLightMode : []
    return modes.includes('flash') || modes.includes('auto')
  } catch {
    return false // lens kan het niet zeggen: geen flitser aannemen
  }
}

/** Zaklamp van een lens: 'yes' = te bedienen, 'maybe' = flitser gemeld maar geen torch (proberen kan), 'no'. */
export type TorchSupport = 'yes' | 'maybe' | 'no'

export async function torchSupportOf(track: MediaStreamTrack | undefined): Promise<TorchSupport> {
  if (!track) return 'no'
  if (trackHasTorch(track)) return 'yes'
  const flash = await photoFlash(track)
  // Na het opvragen van de foto-instellingen staat torch er op sommige toestellen wel.
  if (trackHasTorch(track)) return 'yes'
  return flash ? 'maybe' : 'no'
}

/**
 * Achtercamera's volgens het label (Chrome op Android: "camera2 0, facing back"). Telefoons met meerdere lenzen
 * geven elke lens apart; alleen de hoofdlens heeft meestal de zaklamp. Labels zijn er pas na toestemming.
 */
export function backCameras(devices: readonly Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]): string[] {
  return devices.filter((d) => d.kind === 'videoinput' && d.deviceId && /\b(back|rear|environment)\b/i.test(d.label)).map((d) => d.deviceId)
}

/**
 * Per apparaat onthouden welke lens je gebruikt (met zaklamp, of zelf gekozen met de lensknop), of dat geen lens een
 * zaklamp heeft (met tijdstip). Bij "geen" zoekt de camera niet meer vanzelf; tikken op de zaklamp probeert het opnieuw.
 */
const TORCH_CAMERA_KEY = 'dexcrate:torch-camera'

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
