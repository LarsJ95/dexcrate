import { useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { CardZoom } from '../components/CardZoom'
import { IconCamera, IconSearch, IconUpload } from '../components/Icons'
import { PhotoLarge, PhotoThumb } from '../components/PhotoThumb'
import { UploadQueueList } from '../components/UploadQueueList'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { useUploadQueue } from '../hooks/useUploadQueue'
import { listCards } from '../lib/db'
import { deletePhoto, listInboxPhotos, setPrimaryPhoto, updatePhoto, uploadPhoto } from '../lib/photos'
import { matchesSearch } from '../lib/search'
import { PHOTO_LABELS, statusBadge, type Card, type CardPhoto, type PhotoLabel } from '../lib/types'

const MAX_RESULTS = 8

/** Kaart kiezen om een foto aan te koppelen: zoeken op naam, set of nummer. */
function CardPicker({ cards, onPick, onCancel }: { cards: readonly Card[]; onPick: (c: Card) => void; onCancel: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? cards.filter((c) => matchesSearch(c, query)).slice(0, MAX_RESULTS) : []), [cards, query])
  return (
    <div className="card-picker">
      <div className="search">
        <IconSearch size={18} />
        <input type="search" placeholder="Name, set or number" aria-label="Find card" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      </div>
      {results.length > 0 && (
        <ul className="picker-results">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className="ghost" onClick={() => onPick(c)}>
                <span className="picker-name">{c.name}</span>
                <span className="muted small">
                  {[c.set_code, c.card_number && `#${c.card_number}`, statusBadge(c), c.quantity > 1 ? `${c.quantity}×` : null].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && <p className="muted small">No matching cards.</p>}
      <button type="button" className="ghost small-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

/** Foto-inbox: foto's uploaden zonder dat de kaart al bekend is, en later koppelen. */
export function PhotosPage(): JSX.Element {
  const v2 = useSchemaV2()
  const [photos, setPhotos] = useState<CardPhoto[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<CardPhoto | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (v2 !== true) return
    let cancelled = false
    Promise.all([listInboxPhotos(), listCards()])
      .then(([p, c]) => {
        if (cancelled) return
        setPhotos(p)
        setCards(c)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Loading photos failed.')
      })
    return () => {
      cancelled = true
    }
  }, [v2])

  const { queue, add, retry, dismiss } = useUploadQueue(async (file, name) => {
    const photo = await uploadPhoto(file, name, { cardId: null, label: 'front' })
    setPhotos((list) => [photo, ...(list ?? [])])
  })

  function onFiles(e: ChangeEvent<HTMLInputElement>): void {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length > 0) void add(files, files.map((f) => f.name))
  }

  async function act(photo: CardPhoto, action: () => Promise<void>): Promise<void> {
    if (busyId) return
    setBusyId(photo.id)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Updating the photo failed.')
    } finally {
      setBusyId(null)
    }
  }

  const link = (photo: CardPhoto, card: Card): Promise<void> =>
    act(photo, async () => {
      const linked = await updatePhoto(photo.id, { card_id: card.id })
      // Eerste eigen foto van die kaart: meteen hoofdfoto.
      const final = card.photos.length === 0 ? await setPrimaryPhoto(linked) : linked
      setCards((list) => list.map((c) => (c.id === card.id ? { ...c, photos: [...c.photos, final] } : c)))
      setPhotos((list) => list?.filter((p) => p.id !== photo.id) ?? null)
      setLinking(null)
      setNotice(`Linked to ${card.name}.`)
    })

  const relabel = (photo: CardPhoto, label: PhotoLabel): Promise<void> =>
    act(photo, async () => {
      const updated = await updatePhoto(photo.id, { label })
      setPhotos((list) => list?.map((p) => (p.id === updated.id ? updated : p)) ?? null)
    })

  async function remove(photo: CardPhoto): Promise<void> {
    if (confirmId !== photo.id) {
      setConfirmId(photo.id)
      return
    }
    setConfirmId(null)
    await act(photo, async () => {
      await deletePhoto(photo)
      setPhotos((list) => list?.filter((p) => p.id !== photo.id) ?? null)
    })
  }

  if (v2 === false) {
    return (
      <section className="page">
        <h1>Photos</h1>
        <p className="notice">Photo storage is not set up yet (run STAP4 in Supabase).</p>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Photos</h1>
          <p className="muted">Upload photos now and link them to a card later.</p>
        </div>
        <div className="photo-add">
          <button type="button" onClick={() => setCameraOpen(true)}>
            <IconCamera size={18} />
            Camera
          </button>
          <button type="button" className="primary" onClick={() => fileRef.current?.click()}>
            <IconUpload size={18} />
            Upload photos
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFiles} />

      <UploadQueueList queue={queue} retry={retry} dismiss={dismiss} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}

      {photos === null && !loadError && <p aria-live="polite">Loading…</p>}
      {photos?.length === 0 && queue.length === 0 && <p className="empty">No unlinked photos. Photos you link to a card appear in that card's details.</p>}

      {photos && photos.length > 0 && (
        <ul className="photo-list inbox">
          {photos.map((p) => (
            <li key={p.id} className="photo-item">
              <button type="button" className="photo-thumb" onClick={() => setZoom(p)} aria-label={`View ${PHOTO_LABELS[p.label]} photo`}>
                <PhotoThumb photo={p} />
              </button>
              <select aria-label="Photo label" value={p.label} disabled={busyId === p.id} onChange={(e) => void relabel(p, e.target.value as PhotoLabel)}>
                {(Object.keys(PHOTO_LABELS) as PhotoLabel[]).map((l) => (
                  <option key={l} value={l}>
                    {PHOTO_LABELS[l]}
                  </option>
                ))}
              </select>
              {linking === p.id ? (
                <CardPicker cards={cards} onPick={(c) => void link(p, c)} onCancel={() => setLinking(null)} />
              ) : (
                <div className="photo-item-actions">
                  <button type="button" className="small-btn" disabled={busyId === p.id} onClick={() => setLinking(p.id)}>
                    Link to card
                  </button>
                  <button
                    type="button"
                    className={confirmId === p.id ? 'danger small-btn' : 'ghost small-btn danger-text'}
                    disabled={busyId === p.id}
                    onClick={() => void remove(p)}
                  >
                    {confirmId === p.id ? 'Confirm' : 'Delete'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {cameraOpen && (
        <CameraCapture
          wide={false}
          onCapture={(file) => {
            setCameraOpen(false)
            void add([file], [null])
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
          <PhotoLarge photo={zoom} />
        </CardZoom>
      )}
    </section>
  )
}
