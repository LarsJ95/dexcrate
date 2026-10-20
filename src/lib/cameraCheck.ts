import { backCameras, readTorchMemory, thisBrowserCanControlTorch, torchSupportOf, writeTorchMemory, type TorchSupport } from './torch'

/**
 * Cameracheck (Settings → Scanning, 20-10-2026): wat meldt dit toestel per lens aan de browser? Bedoeld om uit te
 * zoeken waarom de zaklamp niet werkt; het resultaat kun je kopiëren en doorsturen. Opent elke lens kort na elkaar.
 */

export interface LensReport {
  label: string
  facing: string
  torch: TorchSupport
  maxWidth: number | null
  maxHeight: number | null
  /** Naam van de fout als de lens niet te openen was (bv. "NotReadableError"). */
  error: string | null
}

export interface CameraReport {
  browser: string
  imageCapture: boolean
  /** Kent de browser zaklampbediening (torch of Image Capture)? Nee = ligt aan de browser, niet aan de lens. */
  browserTorch: boolean
  lenses: LensReport[]
}

const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms))

const maxOf = (range: unknown): number | null => {
  const max = typeof range === 'object' && range !== null ? (range as { max?: unknown }).max : null
  return typeof max === 'number' && Number.isFinite(max) ? max : null
}

/** Browser en versie, kort (Chromium meldt merk en versie apart). */
export function browserName(nav: Pick<Navigator, 'userAgent'> & { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string } }): string {
  const brands = (nav.userAgentData?.brands ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand))
  const brand = brands.find((b) => b.brand !== 'Chromium') ?? brands[0]
  if (brand) return `${brand.brand} ${brand.version}${nav.userAgentData?.platform ? ` (${nav.userAgentData.platform})` : ''}`
  return nav.userAgent.slice(0, 160)
}

const TORCH_TEXT: Record<TorchSupport, string> = { yes: 'flashlight: yes', maybe: 'flashlight: maybe (flash reported)', no: 'flashlight: no' }

/** Eén regel per lens, om te kopiëren. */
export function reportText(r: CameraReport): string {
  const lines = r.lenses.map((l, i) => {
    const size = l.maxWidth && l.maxHeight ? `, max ${l.maxWidth}×${l.maxHeight}` : ''
    return `${i + 1}. ${l.label || 'camera'} (${l.facing || 'facing unknown'}): ${l.error ? `could not open (${l.error})` : `${TORCH_TEXT[l.torch]}${size}`}`
  })
  const verdict = r.browserTorch ? [] : ['This browser cannot control a flashlight at all. Open Dexcrate in Chrome for the flashlight.']
  return [`Dexcrate camera check`, `Browser: ${r.browser}`, `Image Capture: ${r.imageCapture ? 'yes' : 'no'}`, ...verdict, ...lines].join('\n')
}

export async function checkCameras(): Promise<CameraReport> {
  // Eerst toestemming, anders zijn de lensnamen leeg.
  const first = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  first.getTracks().forEach((t) => t.stop())
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  const lenses: LensReport[] = []
  for (const d of devices) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId } }, audio: false })
      const track = stream.getVideoTracks()[0]
      await wait(500)
      const torch = await torchSupportOf(track)
      const caps: unknown = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null
      const facing = typeof track.getSettings === 'function' ? (track.getSettings().facingMode ?? '') : ''
      lenses.push({
        label: d.label,
        facing,
        torch,
        maxWidth: caps ? maxOf((caps as { width?: unknown }).width) : null,
        maxHeight: caps ? maxOf((caps as { height?: unknown }).height) : null,
        error: null,
      })
      stream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      lenses.push({ label: d.label, facing: '', torch: 'no', maxWidth: null, maxHeight: null, error: err instanceof DOMException ? err.name : 'Error' })
    }
  }
  // Achterlens met zaklamp gevonden: die voortaan in de camera gebruiken (ook als eerder "geen" was onthouden).
  const back = new Set(backCameras(devices))
  const withTorch = devices.find((d, i) => back.has(d.deviceId) && lenses[i]?.torch === 'yes') ?? devices.find((d, i) => back.has(d.deviceId) && lenses[i]?.torch === 'maybe')
  if (withTorch) writeTorchMemory({ kind: 'camera', deviceId: withTorch.deviceId })
  else if (readTorchMemory()?.kind !== 'camera') writeTorchMemory({ kind: 'none', at: Date.now() })
  return {
    browser: browserName(navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string } }),
    imageCapture: typeof (globalThis as { ImageCapture?: unknown }).ImageCapture === 'function',
    browserTorch: thisBrowserCanControlTorch(),
    lenses,
  }
}
