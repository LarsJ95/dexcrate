import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { DEFAULT_TUNING, SAMPLE_H, SAMPLE_W, createAutoCapture, type AutoHint } from '../lib/autoCapture'
import { frameToSource } from '../lib/cameraCrop'
import { setPref, usePrefs } from '../lib/devicePrefs'
import { toGray } from '../lib/sharpness'
import { backCameras, readTorchMemory, setTorch, shouldSearchTorch, trackHasTorch, writeTorchMemory } from '../lib/torch'
import { IconClose, IconFlashlight } from './Icons'

interface Props {
  /** Kaderformaat: één kaart (staand) of een binderpagina (breder). */
  wide: boolean
  onCapture: (file: File) => void
  /** Bestand kiezen in plaats van de camera. */
  onPickFile: () => void
  onClose: () => void
  /** Extra boven de knoppen, bv. de strook met gescande kaarten (snel scannen). */
  children?: ReactNode
  /** Alleen het kader (plus wat marge) bewaren: scherpere tekst, snellere en goedkopere herkenning. */
  crop?: boolean
  /** Knop "Auto" tonen: zelf afdrukken zodra een (nieuwe) kaart stil in het kader ligt. */
  autoCapture?: boolean
}

const AUTO_TICK_MS = 200
const AUTO_TEXT: Record<AutoHint, string> = {
  place: 'Place a card in the frame',
  hold: 'Hold still…',
  swap: 'Got it. Next card',
  same: 'Looks like the last card. Tap the shutter for another copy',
  wait: 'Next card…',
  capture: 'Got it. Next card',
}

/** Hoge resolutie voor kleine tekst; met deviceId een vaste lens (die met de zaklamp), anders de achterkant. */
function videoConstraints(deviceId: string | null): MediaTrackConstraints {
  const size = { width: { ideal: 2560 }, height: { ideal: 1920 } }
  return deviceId ? { ...size, deviceId: { exact: deviceId } } : { ...size, facingMode: { ideal: 'environment' } }
}

const openCamera = (deviceId: string | null): Promise<MediaStream> => navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId), audio: false })

const stopStream = (s: MediaStream | null): void => s?.getTracks().forEach((t) => t.stop())

function playStream(video: HTMLVideoElement | null, stream: MediaStream): void {
  if (!video) return
  video.srcObject = stream
  video.play().catch((err: unknown) => console.warn('Video afspelen mislukt', err))
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Sommige toestellen melden de zaklamp pas even na het starten: zo vaak opnieuw kijken (ms na de vorige keer). */
const TORCH_RECHECKS_MS = [0, 500, 1000]

/**
 * Camera direct in de app (getUserMedia), zodat er geen keuzemenu "Camera / Bestanden" verschijnt.
 * De browser vraagt één keer toestemming en onthoudt die voor deze site.
 */
export function CameraCapture({ wide, onCapture, onPickFile, onClose, children, crop = false, autoCapture = false }: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Geen camera-API (oude browser of geen HTTPS): meteen terugvallen op bestand kiezen.
  const [error, setError] = useState<string | null>(() =>
    typeof navigator.mediaDevices?.getUserMedia === 'function' ? null : 'This browser cannot open the camera here.',
  )
  const [ready, setReady] = useState(false)
  // Korte flits als bevestiging dat de foto is genomen.
  const [flash, setFlash] = useState(0)
  const { autoCapture: autoOn, autoGapMs } = usePrefs()
  const [autoHint, setAutoHint] = useState<AutoHint | null>(null)
  const captureRef = useRef<() => void>(() => undefined)
  // Zaklamp: alleen als de camera hem laat bedienen (veel telefoons, zelden laptops).
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const torchBusy = useRef(false)
  // Andere lenzen proberen voor de zaklamp: beeld is dan even zwart.
  const [searchingTorch, setSearchingTorch] = useState(false)
  const closedRef = useRef(false)

  function attach(stream: MediaStream): void {
    streamRef.current = stream
    playStream(videoRef.current, stream)
  }

  useEffect(() => {
    closedRef.current = false
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return
    // Eerder gevonden lens met zaklamp meteen openen; bestaat die niet meer, dan gewoon de achterkant.
    const memory = readTorchMemory()
    const remembered = memory?.kind === 'camera' ? memory.deviceId : null
    openCamera(remembered)
      .catch((err: unknown) => {
        if (!remembered) throw err
        writeTorchMemory(null)
        return openCamera(null)
      })
      .then((stream) => {
        if (closedRef.current) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        playStream(videoRef.current, stream)
      })
      .catch((err: unknown) => {
        console.error('Camera openen mislukt', err)
        if (closedRef.current) return
        const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
        setError(denied ? 'Camera access was blocked. Allow it in your browser settings, or choose a photo.' : 'Could not open the camera.')
      })
    return () => {
      closedRef.current = true
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  function capture(): void {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const source = { width: video.videoWidth, height: video.videoHeight }
    const frame = frameRef.current
    const box =
      crop && frame
        ? frameToSource(video.getBoundingClientRect(), frame.getBoundingClientRect(), source)
        : { x: 0, y: 0, ...source }
    // Kader niet te meten (bv. heel klein): toch de hele foto gebruiken.
    const area = box.width > 50 && box.height > 50 ? box : { x: 0, y: 0, ...source }
    const canvas = document.createElement('canvas')
    canvas.width = area.width
    canvas.height = area.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Could not take the photo.')
      return
    }
    ctx.drawImage(video, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
    setFlash((n) => n + 1)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not take the photo.')
          return
        }
        onCapture(new File([blob], 'scan.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  useEffect(() => {
    captureRef.current = capture
  })

  // Automatisch afdrukken: elke 200 ms een klein beeld van het kader beoordelen.
  const autoActive = autoCapture && autoOn && ready && !error
  useEffect(() => {
    if (!autoActive) return
    const auto = createAutoCapture({ ...DEFAULT_TUNING, minGapMs: autoGapMs })
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_W
    canvas.height = SAMPLE_H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const timer = window.setInterval(() => {
      const video = videoRef.current
      const frame = frameRef.current
      if (!ctx || !video || !frame || !video.videoWidth) return
      const box = frameToSource(video.getBoundingClientRect(), frame.getBoundingClientRect(), { width: video.videoWidth, height: video.videoHeight }, 0)
      if (box.width < 10 || box.height < 10) return
      ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, SAMPLE_W, SAMPLE_H)
      const { capture: shoot, hint } = auto.step(toGray(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data, SAMPLE_W, SAMPLE_H))
      setAutoHint(hint)
      if (shoot) captureRef.current()
    }, AUTO_TICK_MS)
    return () => window.clearInterval(timer)
  }, [autoActive, autoGapMs])

  function toggleAuto(): void {
    setPref('autoCapture', !autoOn)
    setAutoHint(null)
  }

  const torchChecked = useRef(false)

  function onVideoReady(): void {
    setReady(true)
    // Eén keer per keer openen; na wisselen van lens komt dit opnieuw binnen.
    if (torchChecked.current) return
    torchChecked.current = true
    void findTorch().catch((err: unknown) => console.warn('Zaklamp zoeken mislukt', err))
  }

  /**
   * Zaklamp vinden. Pas als het beeld loopt weet de browser wat de camera kan, soms pas iets later. Heeft deze lens
   * er geen, dan de andere achterlenzen proberen (telefoons met meerdere lenzen openen soms een lens zonder
   * flitser) en de lens met zaklamp onthouden. Niets gevonden: terug naar de eerste lens, en 14 dagen niet opnieuw.
   */
  async function findTorch(): Promise<void> {
    for (const ms of TORCH_RECHECKS_MS) {
      await wait(ms)
      if (closedRef.current) return
      if (trackHasTorch(streamRef.current?.getVideoTracks()[0])) {
        setTorchAvailable(true)
        return
      }
    }
    const memory = readTorchMemory()
    if (!shouldSearchTorch(memory)) return
    const first = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? null
    const others = backCameras(await navigator.mediaDevices.enumerateDevices()).filter((id) => id !== first)
    if (others.length === 0 || closedRef.current) {
      if (!closedRef.current) writeTorchMemory({ kind: 'none', at: Date.now() })
      return
    }
    setSearchingTorch(true)
    setReady(false)
    try {
      // Op Android kan maar één camera tegelijk open: eerst de huidige sluiten.
      stopStream(streamRef.current)
      for (const id of others) {
        const stream = await openCamera(id).catch((err: unknown) => {
          console.warn('Andere lens openen mislukt', err)
          return null
        })
        if (!stream) continue
        const track = stream.getVideoTracks()[0]
        const hasTorch = trackHasTorch(track) || (await wait(TORCH_RECHECKS_MS[1]).then(() => trackHasTorch(track)))
        if (closedRef.current) {
          stopStream(stream)
          return
        }
        if (hasTorch) {
          writeTorchMemory({ kind: 'camera', deviceId: id })
          setTorchAvailable(true)
          attach(stream)
          return
        }
        stopStream(stream)
      }
      writeTorchMemory({ kind: 'none', at: Date.now() })
      try {
        const back = await openCamera(first)
        if (closedRef.current) stopStream(back)
        else attach(back)
      } catch (err) {
        console.error('Camera opnieuw openen mislukt', err)
        if (!closedRef.current) setError('Could not open the camera.')
      }
    } finally {
      if (!closedRef.current) setSearchingTorch(false)
    }
  }

  async function toggleTorch(): Promise<void> {
    const track = streamRef.current?.getVideoTracks()[0]
    // Dubbel tikken: niet twee keer tegelijk schakelen.
    if (!track || torchBusy.current) return
    torchBusy.current = true
    try {
      await setTorch(track, !torchOn)
      setTorchOn(!torchOn)
    } catch (err) {
      // Werkt toch niet op dit toestel: knop weghalen in plaats van een knop die niets doet.
      console.warn('Zaklamp schakelen mislukt', err)
      setTorchAvailable(false)
      setTorchOn(false)
    } finally {
      torchBusy.current = false
    }
  }

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay onLoadedData={onVideoReady} />
      {!error && <div ref={frameRef} className={`camera-frame${wide ? ' wide' : ''}`} aria-hidden="true" />}

      <button type="button" className="camera-close icon-btn" onClick={onClose} aria-label="Close camera">
        <IconClose />
      </button>
      {torchAvailable && !error && (
        <button type="button" className={`camera-torch icon-btn${torchOn ? ' on' : ''}`} onClick={() => void toggleTorch()} aria-pressed={torchOn} aria-label="Flashlight">
          <IconFlashlight />
        </button>
      )}

      {error && (
        <div className="camera-error" role="alert">
          <p>{error}</p>
          <button type="button" className="primary" onClick={onPickFile}>
            Choose photo
          </button>
        </div>
      )}

      {flash > 0 && <div key={flash} className="camera-flash" aria-hidden="true" />}

      <div className="camera-bar">
        {searchingTorch && (
          <p className="auto-status" aria-live="polite">
            Looking for the lens with the flashlight…
          </p>
        )}
        {autoActive && autoHint && (
          <p className="auto-status" aria-live="polite">
            Auto: {AUTO_TEXT[autoHint]}
          </p>
        )}
        {children && <div className="camera-tray">{children}</div>}
        <button type="button" className="camera-files" onClick={onPickFile}>
          Files
        </button>
        <button type="button" className="camera-shutter" onClick={capture} disabled={!ready || !!error} aria-label="Take photo" />
        {autoCapture ? (
          <button type="button" className={`camera-auto${autoOn ? ' on' : ''}`} onClick={toggleAuto} aria-pressed={autoOn} disabled={!!error}>
            Auto
          </button>
        ) : (
          <span className="camera-spacer" />
        )}
      </div>
    </div>
  )
}
