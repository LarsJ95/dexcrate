import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { deletePhoto, setPrimaryPhoto, updatePhoto, uploadPhoto } from '../lib/photos'
import { PHOTO_LABELS, primaryPhoto, type Card, type CardPhoto, type PhotoLabel } from '../lib/types'
import { CameraCapture } from './CameraCapture'
import { CardZoom } from './CardZoom'
import { IconCamera, IconClose, IconUpload } from './Icons'

interface Props {
  card: Card
  /** Kaart met bijgewerkte fotolijst. */
  onChange: (card: Card) => void
}

interface QueueItem {
  key: string
  file: Blob
  name: string | null
  state: 'uploading' | 'error'
  error?: string
}

/** Standaardlabel: eerste foto voorkant, tweede achterkant, daarna detail. */
function nextLabel(count: number): PhotoLabel {
  if (count === 0) return 'front'
  return count === 1 ? 'back' : 'detail'
}

function Thumb({ photo }: { photo: CardPhoto }): JSX.Element {
  const url = usePhotoUrl(photo.thumb_path ?? photo.path)
  return url ? <img src={url} alt="" loading="lazy" /> : <span className="photo-thumb-empty" />
}

function ZoomedPhoto({ photo }: { photo: CardPhoto }): JSX.Element {
  const url = usePhotoUrl(photo.path)
  return url ? <img className="photo-zoom" src={url} alt={PHOTO_LABELS[photo.label]} /> : <span className="photo-thumb-empty" />
}

/** Eigen foto's van een kaartregel: toevoegen (ook meerdere tegelijk), label, hoofdfoto, verwijderen. */
export function PhotoManager({ card, onChange }: Props): JSX.Element {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<CardPhoto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Uploads lopen na elkaar; steeds de nieuwste kaartstand gebruiken.
  const latest = useRef(card)
  useEffect(() => {
    latest.current = card
  }, [card])

  const main = primaryPhoto(card)

  async function upload(item: QueueItem): Promise<void> {
    setQueue((q) => [...q.filter((i) => i.key !== item.key), { ...item, state: 'uploading', error: undefined }])
    try {
      const current = latest.current
      const photo = await uploadPhoto(item.file, item.name, {
        cardId: current.id,
        label: nextLabel(current.photos.length),
        makePrimary: current.photos.length === 0,
      })
      latest.current = { ...latest.current, photos: [...latest.current.photos, photo] }
      onChange(latest.current)
      setQueue((q) => q.filter((i) => i.key !== item.key))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Uploading the photo failed.'
      setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, state: 'error', error: message } : i)))
    }
  }

  async function addFiles(files: readonly Blob[], names: readonly (string | null)[]): Promise<void> {
    const items = files.map((file, i) => ({ key: crypto.randomUUID(), file, name: names[i] ?? null, state: 'uploading' as const }))
    setQueue((q) => [...q, ...items])
    for (const item of items) await upload(item)
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>): void {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length > 0) void addFiles(files, files.map((f) => f.name))
  }

  async function run(photo: CardPhoto, action: () => Promise<CardPhoto[]>): Promise<void> {
    if (busyId) return
    setBusyId(photo.id)
    setError(null)
    try {
      const photos = await action()
      onChange({ ...latest.current, photos })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Updating the photo failed.')
    } finally {
      setBusyId(null)
    }
  }

  const replace = (list: CardPhoto[], updated: CardPhoto): CardPhoto[] => list.map((p) => (p.id === updated.id ? updated : p))

  const makeMain = (photo: CardPhoto): Promise<void> =>
    run(photo, async () => {
      const updated = await setPrimaryPhoto(photo)
      return latest.current.photos.map((p) => (p.id === updated.id ? updated : { ...p, is_primary: false }))
    })

  const relabel = (photo: CardPhoto, label: PhotoLabel): Promise<void> =>
    run(photo, async () => replace(latest.current.photos, await updatePhoto(photo.id, { label })))

  async function remove(photo: CardPhoto): Promise<void> {
    if (confirmId !== photo.id) {
      setConfirmId(photo.id)
      return
    }
    setConfirmId(null)
    await run(photo, async () => {
      await deletePhoto(photo)
      return latest.current.photos.filter((p) => p.id !== photo.id)
    })
  }

  return (
    <section className="photo-manager" aria-labelledby={`photos-${card.id}`}>
      <div className="photo-head">
        <h3 id={`photos-${card.id}`} className="panel-title">
          Your photos
        </h3>
        <div className="photo-add">
          <button type="button" className="ghost small-btn" onClick={() => setCameraOpen(true)}>
            <IconCamera size={16} />
            Camera
          </button>
          <button type="button" className="ghost small-btn" onClick={() => fileRef.current?.click()}>
            <IconUpload size={16} />
            Files
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFiles} />

      {card.photos.length === 0 && queue.length === 0 && <p className="muted small">No photos of this copy yet. The catalog image is shown instead.</p>}

      {card.photos.length > 0 && (
        <ul className="photo-list">
          {card.photos.map((p) => (
            <li key={p.id} className={p.id === main?.id ? 'photo-item is-main' : 'photo-item'}>
              <button type="button" className="photo-thumb" onClick={() => setZoom(p)} aria-label={`View ${PHOTO_LABELS[p.label]} photo`}>
                <Thumb photo={p} />
              </button>
              <select
                aria-label="Photo label"
                value={p.label}
                disabled={busyId === p.id}
                onChange={(e) => void relabel(p, e.target.value as PhotoLabel)}
              >
                {(Object.keys(PHOTO_LABELS) as PhotoLabel[]).map((l) => (
                  <option key={l} value={l}>
                    {PHOTO_LABELS[l]}
                  </option>
                ))}
              </select>
              <div className="photo-item-actions">
                {p.id === main?.id ? (
                  <span className="chip">Main photo</span>
                ) : (
                  <button type="button" className="ghost small-btn" disabled={busyId === p.id} onClick={() => void makeMain(p)}>
                    Make main
                  </button>
                )}
                <button
                  type="button"
                  className={confirmId === p.id ? 'danger small-btn' : 'ghost small-btn danger-text'}
                  disabled={busyId === p.id}
                  onClick={() => void remove(p)}
                >
                  {confirmId === p.id ? 'Confirm' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {queue.length > 0 && (
        <ul className="upload-queue" aria-live="polite">
          {queue.map((q) => (
            <li key={q.key} className={q.state === 'error' ? 'error' : undefined}>
              <span className="upload-name">{q.name ?? 'Camera photo'}</span>
              {q.state === 'uploading' ? (
                <span className="muted">Uploading…</span>
              ) : (
                <>
                  <span>{q.error}</span>
                  <button type="button" className="ghost small-btn" onClick={() => void upload(q)}>
                    Try again
                  </button>
                  <button
                    type="button"
                    className="ghost icon-btn"
                    aria-label="Dismiss"
                    onClick={() => setQueue((list) => list.filter((i) => i.key !== q.key))}
                  >
                    <IconClose size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {cameraOpen && (
        <CameraCapture
          wide={false}
          onCapture={(file) => {
            setCameraOpen(false)
            void addFiles([file], [null])
          }}
          onPickFile={() => {
            setCameraOpen(false)
            fileRef.current?.click()
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {zoom && (
        <CardZoom label={PHOTO_LABELS[zoom.label]} onClose={() => setZoom(null)}>
          <ZoomedPhoto photo={zoom} />
        </CardZoom>
      )}
    </section>
  )
}
