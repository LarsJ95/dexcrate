import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { DEFAULT_TUNING, SAMPLE_H, SAMPLE_W, createAutoCapture, type AutoHint } from '../lib/autoCapture'
import { frameToSource } from '../lib/cameraCrop'
import { setPref, usePrefs } from '../lib/devicePrefs'
import { toGray } from '../lib/sharpness'
import { backCameras, isFirefox, readTorchMemory, setTorch, thisBrowserCanControlTorch, torchSupportOf, trackHasTorch, writeTorchMemory, type TorchSupport } from '../lib/torch'
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

/** Hoe lang een korte melding in de camera blijft staan. */
const NOTE_MS = 4500

/** Waarom de zaklamp niet kan: in Firefox ligt het aan de browser (dan Chrome noemen), anders aan het toestel. */
const NO_TORCH = isFirefox(navigator.userAgent)
  ? 'Firefox cannot switch on the flashlight. Open Dexcrate in Chrome to use it.'
  : 'This phone does not let the browser use the flashlight here. Move closer to a lamp; Settings → Scanning → Check camera shows why.'

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
  // Zaklamp (20-10-2026: knop altijd zichtbaar, op verzoek): 'checking' tot bekend is wat deze lens kan.
  const [torch, setTorchState] = useState<'checking' | TorchSupport>('checking')
  const [torchOn, setTorchOn] = useState(false)
  const torchBusy = useRef(false)
  // Andere lenzen proberen of wisselen: beeld is dan even zwart; tekst in de statusregel.
  const [busyText, setBusyText] = useState<string | null>(null)
  // Korte melding (bv. waarom de zaklamp niet kan), verdwijnt vanzelf.
  const [note, setNote] = useState<string | null>(null)
  // Achterlenzen (na toestemming bekend) en de lens die nu open is.
  const [lenses, setLenses] = useState<string[]>([])
  const [lensId, setLensId] = useState<string | null>(null)
  /** Andere lenzen al geprobeerd in deze sessie (niet steeds opnieuw zwart beeld). */
  const searched = useRef(false)
  /** Track waarvoor de zaklamp al bekeken is; een nieuwe lens geeft een nieuwe track. */
  const checkedTrack = useRef<string | null>(null)
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

  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), NOTE_MS)
    return () => window.clearTimeout(t)
  }, [note])

  const currentTrack = (): MediaStreamTrack | undefined => streamRef.current?.getVideoTracks()[0]

  function onVideoReady(): void {
    setReady(true)
    void afterStart().catch((err: unknown) => console.warn('Zaklamp bekijken mislukt', err))
  }

  /**
   * Na het starten van een lens: wat kan de zaklamp? Pas als het beeld loopt weet de browser dat, soms iets later.
   * Eerste keer ooit en geen zaklamp: de andere achterlenzen proberen (telefoons openen soms een lens zonder flitser).
   */
  async function afterStart(): Promise<void> {
    const track = currentTrack()
    if (!track || checkedTrack.current === track.id) return
    checkedTrack.current = track.id
    setTorchOn(false)
    setTorchState('checking')
    setLensId(track.getSettings().deviceId ?? null)
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (!closedRef.current) setLenses(backCameras(devices))
      })
      .catch((err: unknown) => console.warn('Lenzen opvragen mislukt', err))
    let support: TorchSupport = 'no'
    for (const ms of TORCH_RECHECKS_MS) {
      await wait(ms)
      if (closedRef.current || currentTrack() !== track) return
      if (trackHasTorch(track)) {
        support = 'yes'
        break
      }
    }
    if (support === 'no') support = await torchSupportOf(track)
    if (closedRef.current || currentTrack() !== track) return
    setTorchState(support)
    // Browser kan geen zaklamp bedienen (Firefox): niet naar andere lenzen zoeken, dat gaf alleen even zwart beeld.
    if (support === 'no' && thisBrowserCanControlTorch() && readTorchMemory() === null && !searched.current) await searchOtherLenses(false)
  }

  /** Andere achterlenzen proberen; de beste met zaklamp openen en onthouden. Geeft true als er een is. */
  async function searchOtherLenses(userAsked: boolean): Promise<boolean> {
    searched.current = true
    const first = currentTrack()?.getSettings().deviceId ?? null
    const others = backCameras(await navigator.mediaDevices.enumerateDevices()).filter((id) => id !== first)
    if (others.length === 0 || closedRef.current) {
      if (!closedRef.current) writeTorchMemory({ kind: 'none', at: Date.now() })
      if (userAsked && !closedRef.current) setNote(NO_TORCH)
      return false
    }
    setBusyText('Looking for the lens with the flashlight…')
    setReady(false)
    try {
      // Op Android kan maar één camera tegelijk open: eerst de huidige sluiten.
      stopStream(streamRef.current)
      let maybe: { id: string; stream: MediaStream } | null = null
      for (const id of others) {
        const stream = await openCamera(id).catch((err: unknown) => {
          console.warn('Andere lens openen mislukt', err)
          return null
        })
        if (!stream) continue
        if (closedRef.current) {
          stopStream(stream)
          return false
        }
        await wait(TORCH_RECHECKS_MS[1])
        const support = await torchSupportOf(stream.getVideoTracks()[0])
        if (support === 'yes') {
          if (maybe) stopStream(maybe.stream)
          writeTorchMemory({ kind: 'camera', deviceId: id })
          attach(stream)
          return true
        }
        if (support === 'maybe' && !maybe) maybe = { id, stream }
        else stopStream(stream)
      }
      if (maybe) {
        writeTorchMemory({ kind: 'camera', deviceId: maybe.id })
        attach(maybe.stream)
        return true
      }
      writeTorchMemory({ kind: 'none', at: Date.now() })
      if (userAsked) setNote(NO_TORCH)
      try {
        const back = await openCamera(first)
        if (closedRef.current) stopStream(back)
        else attach(back)
      } catch (err) {
        console.error('Camera opnieuw openen mislukt', err)
        if (!closedRef.current) setError('Could not open the camera.')
      }
      return false
    } finally {
      if (!closedRef.current) setBusyText(null)
    }
  }

  /** Volgende achterlens (sommige lenzen stellen scherper op dichtbij, of hebben de flitser). Onthouden. */
  async function switchLens(): Promise<void> {
    if (lenses.length < 2 || busyText) return
    const next = lenses[(Math.max(0, lenses.indexOf(lensId ?? '')) + 1) % lenses.length]
    setBusyText('Switching lens…')
    setReady(false)
    stopStream(streamRef.current)
    try {
      const stream = await openCamera(next)
      if (closedRef.current) {
        stopStream(stream)
        return
      }
      writeTorchMemory({ kind: 'camera', deviceId: next })
      attach(stream)
    } catch (err) {
      console.warn('Lens wisselen mislukt', err)
      setNote('Could not switch to that lens.')
      try {
        attach(await openCamera(lensId))
      } catch (err2) {
        console.error('Camera opnieuw openen mislukt', err2)
        if (!closedRef.current) setError('Could not open the camera.')
      }
    } finally {
      if (!closedRef.current) setBusyText(null)
    }
  }

  async function toggleTorch(): Promise<void> {
    // Dubbel tikken: niet twee keer tegelijk schakelen.
    if (torch === 'checking' || torchBusy.current || busyText) return
    torchBusy.current = true
    try {
      if (torch === 'no') {
        // Op verzoek de andere lenzen proberen (één keer per sessie); anders uitleggen waarom het niet kan.
        if (!thisBrowserCanControlTorch() || searched.current || lenses.length < 2) setNote(NO_TORCH)
        else await searchOtherLenses(true)
        return
      }
      const track = currentTrack()
      if (!track) return
      await setTorch(track, !torchOn)
      setTorchOn(!torchOn)
    } catch (err) {
      console.warn('Zaklamp schakelen mislukt', err)
      setTorchState('no')
      setTorchOn(false)
      setNote(NO_TORCH)
    } finally {
      torchBusy.current = false
    }
  }

  const lensNo = Math.max(0, lenses.indexOf(lensId ?? '')) + 1

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay onLoadedData={onVideoReady} />
      {!error && <div ref={frameRef} className={`camera-frame${wide ? ' wide' : ''}`} aria-hidden="true" />}

      <button type="button" className="camera-close icon-btn" onClick={onClose} aria-label="Close camera">
        <IconClose />
      </button>
      {!error && (
        <div className="camera-tools">
          <button
            type="button"
            className={`camera-torch icon-btn${torchOn ? ' on' : ''}${torch === 'no' ? ' is-unavailable' : ''}`}
            onClick={() => void toggleTorch()}
            disabled={torch === 'checking' || busyText !== null}
            aria-pressed={torchOn}
            aria-label={torch === 'no' ? 'Flashlight (not available on this lens)' : 'Flashlight'}
          >
            <IconFlashlight />
          </button>
          {lenses.length > 1 && (
            <button type="button" className="camera-lens" onClick={() => void switchLens()} disabled={busyText !== null} aria-label={`Switch lens (now ${lensNo} of ${lenses.length})`}>
              Lens {lensNo}/{lenses.length}
            </button>
          )}
        </div>
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
        {(busyText ?? note) && (
          <p className="auto-status" role="status">
            {busyText ?? note}
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
