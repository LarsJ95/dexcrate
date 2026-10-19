import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { DEFAULT_TUNING, SAMPLE_H, SAMPLE_W, createAutoCapture, type AutoHint } from '../lib/autoCapture'
import { frameToSource } from '../lib/cameraCrop'
import { setPref, usePrefs } from '../lib/devicePrefs'
import { toGray } from '../lib/sharpness'
import { setTorch, trackHasTorch } from '../lib/torch'
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

  useEffect(() => {
    let cancelled = false
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.play().catch((err: unknown) => console.warn('Video afspelen mislukt', err))
        }
      })
      .catch((err: unknown) => {
        console.error('Camera openen mislukt', err)
        if (cancelled) return
        const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
        setError(denied ? 'Camera access was blocked. Allow it in your browser settings, or choose a photo.' : 'Could not open the camera.')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
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

  function onVideoReady(): void {
    setReady(true)
    // Pas als het beeld loopt weet de browser zeker wat de camera kan.
    setTorchAvailable(trackHasTorch(streamRef.current?.getVideoTracks()[0]))
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
