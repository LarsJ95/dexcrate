import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type JSX } from 'react'
import { BinderScanResult } from '../components/BinderScanResult'
import { CameraCapture } from '../components/CameraCapture'
import { CardDialog } from '../components/CardDialog'
import { ScanSessionSummary, SingleScanResult } from '../components/ScanParts'
import { QueueStrip, ScanQueue } from '../components/ScanQueue'
import { listCards } from '../lib/db'
import { findCandidates, type Candidate } from '../lib/match'
import { uploadPhoto } from '../lib/photos'
import { useDbFeature } from '../hooks/useDbFeature'
import { useNewCardDefaults } from '../hooks/useNewCardDefaults'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { summarize } from '../lib/scanQueue'
import { enqueue, getQueue, removeItems, setWishedKeys, subscribe } from '../lib/scanQueueStore'
import { useWakeLock } from '../hooks/useWakeLock'
import { getPrefs } from '../lib/devicePrefs'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { listWishlist } from '../lib/wishlist'
import { closeSession, earlierInSession, hasScanSessions, itemsFromRows, openSession, saveSessionItems, startSession, type ScanItem, type ScanSession } from '../lib/scanSessions'
import {
  draftFromScan,
  prepareImage,
  recognizeCards,
  type PreparedImage,
  type Recognition,
  type ScanMode,
} from '../lib/scan'
import { lookupLang, type Lang } from '../lib/tcgdex'
import type { Card, CardInput } from '../lib/types'
import { errorText } from '../lib/errors'

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; message: string }
  | { kind: 'single'; recognition: Recognition; candidates: Candidate[]; lang: Lang }
  | { kind: 'multi'; recognitions: Recognition[]; scanId: number }
  | { kind: 'error'; message: string }

/** 'queue' = snel scannen: foto na foto, herkennen op de achtergrond, later in één keer toevoegen. */
type PageMode = ScanMode | 'queue'

const MODE_HINT: Record<PageMode, string> = {
  queue: 'Photograph card after card; recognition runs in the background. Check and add them all at once when you are done.',
  single: 'Photograph one card straight on, with the bottom edge readable.',
  multi: 'Photograph a full binder page from straight above, without glare on the sleeves.',
}

export function ScanPage(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [mode, setMode] = useState<PageMode>(() => getPrefs().scanMode)
  const [cards, setCards] = useState<Card[]>([])
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [draft, setDraft] = useState<{ values: Partial<CardInput>; position: number | null; queueId?: string } | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  // Snel scannen: scherm aan houden zolang de camera open is of er nog foto's herkend worden.
  const queueBusy = summarize(useSyncExternalStore(subscribe, getQueue)).busy > 0
  // Wishlist: ster bij gescande kaarten die je zoekt.
  const wishlistOn = useWishlistEnabled() === true
  const [wished, setWished] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (!wishlistOn) return
    let cancelled = false
    listWishlist()
      .then((items) => {
        if (cancelled) return
        const keys = new Set(items.flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : [])))
        setWished(keys)
        setWishedKeys(keys)
      })
      .catch((err: unknown) => console.warn('Wishlist laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [wishlistOn])
  const [donePositions, setDonePositions] = useState<ReadonlySet<number>>(new Set())
  const [added, setAdded] = useState<string[]>([])
  // Herkennen en de foto bewaren zijn aparte keuzes: alleen bewaren als je dat aanvinkt.
  const [keepPhoto, setKeepPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const v2 = useSchemaV2() === true
  const newCardDefaults = useNewCardDefaults()
  // Scansessie (STAP8): tussentijds bewaard, en waarschuwing bij nogmaals dezelfde kaart.
  const sessionsOn = useDbFeature(hasScanSessions, 'scan-sessions') === true
  const [session, setSession] = useState<ScanSession | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [dup, setDup] = useState<{ candidate: Candidate | null; recognition: Recognition; lang: Lang; earlier: ScanItem } | null>(null)

  useEffect(() => {
    if (!sessionsOn) return
    let cancelled = false
    openSession()
      .then((s) => {
        if (!cancelled) setSession(s)
      })
      .catch((err: unknown) => console.warn('Scansessie laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [sessionsOn])

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((rows) => {
        if (!cancelled) setCards(rows)
      })
      .catch((err: unknown) => console.error('Collectie laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Voorbeeldfoto opruimen als er een nieuwe komt.
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.previewUrl)
  }, [image])

  const ownedByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cards) if (c.tcgdex_id && c.status !== 'sold') map.set(c.tcgdex_id, (map.get(c.tcgdex_id) ?? 0) + c.quantity)
    return map
  }, [cards])

  const nextSortOrder = cards.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (mode === 'queue') {
      // Snel scannen: meerdere foto's tegelijk kiezen mag.
      for (const f of files) addToQueue(f)
      return
    }
    if (files[0]) void processPhoto(files[0], mode)
  }

  /** `fromCamera`: wazige foto's tegenhouden (bestanden kies je bewust, die niet). */
  function addToQueue(file: File, fromCamera = false): void {
    setQueueError(null)
    enqueue(file, fromCamera && getPrefs().blurCheck).catch((err: unknown) => {
      console.error('Foto toevoegen aan wachtrij mislukt', err)
      setQueueError(errorText(err, 'Adding the photo failed.'))
    })
  }

  async function processPhoto(file: File, mode: ScanMode): Promise<void> {
    setCameraOpen(false)
    if (phase.kind === 'working') return
    try {
      setPhase({ kind: 'working', message: 'Preparing photo…' })
      const prepared = await prepareImage(file, mode)
      setImage(prepared)
      setDonePositions(new Set())
      setPhase({ kind: 'working', message: mode === 'multi' ? 'Recognising cards…' : 'Recognising card…' })
      const result = await recognizeCards(prepared, mode)

      if (mode === 'multi') {
        setPhase({ kind: 'multi', recognitions: result.cards, scanId: Date.now() })
        return
      }
      const recognition = result.cards[0]
      if (!recognition) {
        setPhase({ kind: 'error', message: 'No Pokémon card found in this photo. Try again with the card filling the frame.' })
        return
      }
      setPhase({ kind: 'working', message: 'Looking up card…' })
      const lang = lookupLang(recognition.language)
      const candidates = await findCandidates(
        { name: recognition.nameEnglish, set_code: recognition.setCode || null, card_number: recognition.cardNumber || null, set_total: recognition.setTotal || null },
        lang,
      )
      setPhase({ kind: 'single', recognition, candidates, lang })
    } catch (err) {
      console.error(err)
      setPhase({ kind: 'error', message: errorText(err, 'Scan failed.') })
    }
  }

  async function chooseSingle(c: Candidate | null, r: Recognition, lang: Lang, force = false): Promise<void> {
    // Al in deze sessie toegevoegd? Eerst vragen, zodat je niet per ongeluk dezelfde kaart twee keer toevoegt.
    const earlier = session
      ? earlierInSession(session.items, { tcgdex_id: c?.key ?? null, variant: r.variant, name: r.nameEnglish || r.namePrinted, set_code: r.setCode || null, card_number: r.cardNumber || null })
      : null
    if (earlier && !force) {
      setDup({ candidate: c, recognition: r, lang, earlier })
      return
    }
    setDup(null)
    // Standaardwaarden (conditie, locatie) aanvullen; wat de scan herkende gaat voor.
    const { language: _lang, set_code: _set, ...extra } = newCardDefaults
    void _lang
    void _set
    setDraft({ values: { ...extra, ...(await draftFromScan(r, c, lang)) }, position: null })
  }

  function rememberAdded(rows: Card[]): void {
    if (sessionsOn) void addToSession(rows)
    setCards((list) => [...list, ...rows])
    setAdded((a) => [...a, ...rows.map((r) => r.name)].slice(-8))
  }

  async function addToSession(rows: Card[]): Promise<void> {
    try {
      const s = session ?? (await startSession())
      const items = [...s.items, ...itemsFromRows(rows)]
      await saveSessionItems(s.id, items)
      setSession({ ...s, items })
      setSessionError(null)
    } catch (err) {
      setSessionError(errorText(err, 'Saving the scan session failed.'))
    }
  }

  async function endSession(): Promise<void> {
    if (!session) return
    try {
      await closeSession(session.id)
      setSession(null)
      setAdded([])
    } catch (err) {
      setSessionError(errorText(err, 'Closing the scan session failed.'))
    }
  }

  function reset(): void {
    setDup(null)
    setPhase({ kind: 'idle' })
    setImage(null)
  }

  const busy = phase.kind === 'working'
  useWakeLock(mode === 'queue' && (cameraOpen || queueBusy))

  return (
    <section className="page scan">
      <div className="page-head">
        <div>
          <h1>Scan</h1>
          <p className="muted">{MODE_HINT[mode]}</p>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Scan mode">
        {(
          [
            ['queue', 'Quick scan'],
            ['single', 'Single card'],
            ['multi', 'Binder page'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            disabled={busy}
            onClick={() => {
              setMode(key)
              reset()
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={mode === 'queue'}
        className="visually-hidden"
        tabIndex={-1}
        onChange={onFile}
        aria-hidden="true"
      />

      <ScanSessionSummary session={session} added={added} onEnd={() => void endSession()} />
      {sessionError && (
        <p className="error" role="alert">
          {sessionError}
        </p>
      )}
      {photoError && (
        <p className="error" role="alert">
          The card was added, but its scan photo was not saved: {photoError}
        </p>
      )}

      {mode === 'queue' && (
        <div className="scan-actions queue-start">
          <button type="button" className="scan-button" onClick={() => setCameraOpen(true)}>
            Take photos
          </button>
          <button type="button" className="ghost" onClick={() => inputRef.current?.click()}>
            Choose from files
          </button>
          {queueError && (
            <p className="error" role="alert">
              {queueError}
            </p>
          )}
        </div>
      )}

      {mode !== 'queue' && (
        <div className="scan-stage">
          {image ? (
            <img className={`scan-photo${mode === 'multi' ? ' wide' : ''}`} src={image.previewUrl} alt="Your photo" />
          ) : (
            <div className={`scan-photo empty${mode === 'multi' ? ' wide' : ''}`} aria-hidden="true" />
          )}
          <div className="scan-actions">
            <button type="button" className="scan-button" onClick={() => setCameraOpen(true)} disabled={busy}>
              {phase.kind === 'idle' ? 'Take photo' : 'New photo'}
            </button>
            <button type="button" className="ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
              Choose from files
            </button>
            {v2 && mode === 'single' && (
              <label className="check">
                <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
                Also save this scan as a photo of the card
              </label>
            )}
            {busy && <p aria-live="polite">{phase.message}</p>}
            {phase.kind === 'error' && <p className="error" role="alert">{phase.message}</p>}
          </div>
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          wide={mode === 'multi'}
          crop={mode !== 'multi'}
          autoCapture={mode === 'queue'}
          onCapture={(file) => (mode === 'queue' ? addToQueue(file, true) : void processPhoto(file, mode))}
          onPickFile={() => {
            setCameraOpen(false)
            inputRef.current?.click()
          }}
          onClose={() => setCameraOpen(false)}
        >
          {mode === 'queue' ? <QueueStrip /> : null}
        </CameraCapture>
      )}

      {mode === 'queue' && (
        <ScanQueue
          ownedByKey={ownedByKey}
          nextSortOrder={nextSortOrder}
          defaultCondition={newCardDefaults.condition ?? null}
          onAdded={rememberAdded}
          onEdit={(values, queueId) => setDraft({ values, position: null, queueId })}
          wished={wished}
        />
      )}

      {phase.kind === 'multi' && (
        <BinderScanResult
          key={phase.scanId}
          recognitions={phase.recognitions}
          ownedByKey={ownedByKey}
          nextSortOrder={nextSortOrder}
          done={donePositions}
          onAdded={rememberAdded}
          onEdit={(values, position) => setDraft({ values, position })}
          onCancel={reset}
        />
      )}

      {phase.kind === 'single' && (
        <SingleScanResult
          recognition={phase.recognition}
          candidates={phase.candidates}
          ownedByKey={ownedByKey}
          earlier={dup?.earlier ?? null}
          onChoose={(c) => void chooseSingle(c, phase.recognition, phase.lang)}
          onAddAnotherCopy={() => {
            if (dup) void chooseSingle(dup.candidate, dup.recognition, dup.lang, true)
          }}
          onReset={reset}
        />
      )}

      {draft && (
        <CardDialog
          card={null}
          initial={draft.values}
          defaultStatus="collection"
          nextSortOrder={nextSortOrder}
          onClose={() => setDraft(null)}
          onSaved={(rows) => {
            rememberAdded(rows)
            const position = draft.position
            // Uit de snelle wachtrij: die kaart is nu toegevoegd.
            if (draft.queueId) {
              removeItems([draft.queueId])
              setDraft(null)
              return
            }
            // Scanfoto alleen bewaren als je dat koos. Hoofdfoto alleen als er geen officiële afbeelding is.
            const photo = image?.blob
            if (keepPhoto && position === null && photo) {
              for (const row of rows) {
                uploadPhoto(photo, null, { cardId: row.id, label: 'scan', makePrimary: !row.tcgdex_id })
                  .then((saved) => setCards((list) => list.map((c) => (c.id === row.id ? { ...c, photos: [...c.photos, saved] } : c))))
                  .catch((err: unknown) => {
                    console.warn('Scanfoto bewaren mislukt', err)
                    setPhotoError(errorText(err, 'Saving the scan photo failed.'))
                  })
              }
            }
            setDraft(null)
            // Losse scan: klaar voor de volgende. Binderpagina: alleen deze kaart afvinken.
            if (position === null) reset()
            else setDonePositions((s) => new Set([...s, position]))
          }}
          onDeleted={() => setDraft(null)}
        />
      )}
    </section>
  )
}
