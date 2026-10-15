import { useEffect, useRef, useState, type JSX } from 'react'
import { IconClose } from './Icons'

interface Props {
  /** Kaderformaat: één kaart (staand) of een binderpagina (breder). */
  wide: boolean
  onCapture: (file: File) => void
  /** Bestand kiezen in plaats van de camera. */
  onPickFile: () => void
  onClose: () => void
}

/**
 * Camera direct in de app (getUserMedia), zodat er geen keuzemenu "Camera / Bestanden" verschijnt.
 * De browser vraagt één keer toestemming en onthoudt die voor deze site.
 */
export function CameraCapture({ wide, onCapture, onPickFile, onClose }: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Geen camera-API (oude browser of geen HTTPS): meteen terugvallen op bestand kiezen.
  const [error, setError] = useState<string | null>(() =>
    typeof navigator.mediaDevices?.getUserMedia === 'function' ? null : 'This browser cannot open the camera here.',
  )
  const [ready, setReady] = useState(false)

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
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Could not take the photo.')
      return
    }
    ctx.drawImage(video, 0, 0)
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

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay onLoadedData={() => setReady(true)} />
      {!error && <div className={`camera-frame${wide ? ' wide' : ''}`} aria-hidden="true" />}

      <button type="button" className="camera-close icon-btn" onClick={onClose} aria-label="Close camera">
        <IconClose />
      </button>

      {error && (
        <div className="camera-error" role="alert">
          <p>{error}</p>
          <button type="button" className="primary" onClick={onPickFile}>
            Choose photo
          </button>
        </div>
      )}

      <div className="camera-bar">
        <button type="button" className="camera-files" onClick={onPickFile}>
          Files
        </button>
        <button type="button" className="camera-shutter" onClick={capture} disabled={!ready || !!error} aria-label="Take photo" />
        <span className="camera-spacer" />
      </div>
    </div>
  )
}
