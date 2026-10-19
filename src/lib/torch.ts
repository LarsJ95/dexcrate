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
