import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type JSX } from 'react'
import { BinderScanResult } from '../components/BinderScanResult'
import { CameraCapture } from '../components/CameraCapture'
import { CardDialog } from '../components/CardDialog'
import { IconBinder, IconCamera, IconCards } from '../components/Icons'
import { ScanSessionSummary, SingleScanResult } from '../components/ScanParts'
import { QueueStrip, ScanQueue } from '../components/ScanQueue'
import { ScanRecent } from '../components/ScanRecent'
import { addedQuietly } from '../lib/celebrate'
import { insertCards, listCards } from '../lib/db'
import { autoPick, type Candidate } from '../lib/match'
import { onChsCatalogReady } from '../lib/chsCatalog'
import { recordChoices, scanCandidates, type ChoiceInput } from '../lib/scanMemory'
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
import { EMPTY_CARD, type Card, type CardInput, type Variant } from '../lib/types'
import { errorText } from '../lib/errors'

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; message: string }
  | { kind: 'single'; recognition: Recognition; candidates: Candidate[]; lang: Lang; resultId: number }
  | { kind: 'multi'; recognitions: Recognition[]; scanId: number }
  | { kind: 'error'; message: string }

/** 'queue' = snel scannen: foto na foto, herkennen op de achtergrond, later in één keer toevoegen. */
type PageMode = ScanMode | 'queue'

/**
 * Scanmodi als tegels (gekozen 20-10-2026): één tik start de camera in die modus. De modus die je nu gebruikt staat
 * bovenaan en het grootst; de korte tekst vervangt de vroegere uitleg boven de keuzeknoppen.
 */
const MODES: readonly { key: PageMode; title: string; text: string }[] = [
  { key: 'queue', title: 'Quick scan', text: 'Card after card; check and add them all at the end.' },
  { key: 'single', title: 'Single card', text: 'One card, added straight away.' },
  { key: 'multi', title: 'Binder page', text: 'A whole binder page in one photo.' },
]

const MODE_ICON: Record<PageMode, (p: { size?: number }) => JSX.Element> = { queue: IconCamera, single: IconCards, multi: IconBinder }

export function ScanPage(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [mode, setMode] = useState<PageMode>(() => getPrefs().scanMode)
  const [cards, setCards] = useState<Card[]>([])
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  /** Formulier voor een gescande kaart; `choice` = lezing + kandidaten, om je keuze na opslaan te onthouden. */
  const [draft, setDraft] = useState<{ values: Partial<CardInput>; position: number | null; queueId?: string; choice?: Omit<ChoiceInput, 'chosen'> } | null>(null)
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
  const [dup, setDup] = useState<{ candidate: Candidate | null; recognition: Recognition; lang: Lang; earlier: ScanItem; action: 'add' | 'edit'; variant: Variant | null } | null>(null)
  /** Telt per foto (en bij weggooien), zodat een laat antwoord van "Search again" niets overschrijft. */
  const scanSeq = useRef(0)
  /** Telt per resultaat: nieuw resultaat = keuzes (selectie, uitvoering) opnieuw. */
  const resultSeq = useRef(0)
  /** Laatste foto kwam van de camera: na direct toevoegen gaat die weer open. */
  const lastFromCamera = useRef(false)

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

  /** Tegel aangetikt: in die modus de camera openen (een andere modus begint met een schone lei). */
  function startMode(key: PageMode): void {
    if (key !== mode) {
      setMode(key)
      reset()
    }
    setCameraOpen(true)
  }

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (mode === 'queue') {
      // Snel scannen: meerdere foto's tegelijk kiezen mag.
      for (const f of files) addToQueue(f)
      return
    }
    if (files[0]) void processPhoto(files[0], mode, false)
  }

  /** `fromCamera`: wazige foto's tegenhouden (bestanden kies je bewust, die niet). */
  function addToQueue(file: File, fromCamera = false): void {
    setQueueError(null)
    enqueue(file, fromCamera && getPrefs().blurCheck).catch((err: unknown) => {
      console.error('Foto toevoegen aan wachtrij mislukt', err)
      setQueueError(errorText(err, 'Adding the photo failed.'))
    })
  }

  async function processPhoto(file: File, mode: ScanMode, fromCamera: boolean): Promise<void> {
    setCameraOpen(false)
    if (phase.kind === 'working') return
    scanSeq.current += 1
    lastFromCamera.current = fromCamera
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
      const candidates = await scanCandidates(recognition)
      resultSeq.current += 1
      setPhase({ kind: 'single', recognition, candidates, lang, resultId: resultSeq.current })
    } catch (err) {
      console.error(err)
      setPhase({ kind: 'error', message: errorText(err, 'Scan failed.') })
    }
  }

  /** Gecorrigeerde gelezen waarden: opnieuw zoeken in de catalogus. Fouten gaan naar het formulier. */
  async function searchAgain(r: Recognition): Promise<void> {
    const seq = scanSeq.current
    const lang = lookupLang(r.language)
    const candidates = await scanCandidates(r)
    // Intussen een nieuwe foto gemaakt of weggegooid: dit antwoord hoort daar niet meer bij.
    if (seq !== scanSeq.current) return
    setDup(null)
    resultSeq.current += 1
    setPhase({ kind: 'single', recognition: r, candidates, lang, resultId: resultSeq.current })
  }

  // Chinese catalogus net binnen: een Chinese kaart zonder zekere match opnieuw opzoeken (geen nieuwe scan).
  const phaseRef = useRef(phase)
  const searchAgainRef = useRef(searchAgain)
  useEffect(() => {
    phaseRef.current = phase
    searchAgainRef.current = searchAgain
  })
  useEffect(
    () =>
      onChsCatalogReady(() => {
        const p = phaseRef.current
        if (p.kind !== 'single' || (p.lang !== 'zh-cn' && p.lang !== 'zh-tw') || autoPick(p.candidates)) return
        searchAgainRef.current(p.recognition).catch((err: unknown) => console.warn('Opnieuw opzoeken mislukt', err))
      }),
    [],
  )

  /** "Look again": dezelfde foto nog eens door het sterkere model. Fouten gaan naar het resultaat (dat blijft staan). */
  async function lookAgain(): Promise<void> {
    if (!image) return
    const seq = scanSeq.current
    const recognition = (await recognizeCards(image, 'single', { strong: true })).cards[0]
    if (!recognition) throw new Error('No Pokémon card found, also on a second look. Try a new photo.')
    const lang = lookupLang(recognition.language)
    const candidates = await scanCandidates(recognition)
    if (seq !== scanSeq.current) return
    setDup(null)
    resultSeq.current += 1
    setPhase({ kind: 'single', recognition, candidates, lang, resultId: resultSeq.current })
  }

  /** Al in deze sessie toegevoegd? Dan eerst vragen (zie dup), zodat je niet per ongeluk dezelfde kaart twee keer toevoegt. */
  function earlierFor(c: Candidate | null, r: Recognition, variant: Variant | null): ScanItem | null {
    if (!session) return null
    return earlierInSession(session.items, { tcgdex_id: c?.key ?? null, variant, name: r.nameEnglish || r.namePrinted, set_code: r.setCode || null, card_number: r.cardNumber || null })
  }

  /** Formuliervelden: je standaardwaarden (conditie, locatie) aangevuld met wat de scan herkende (dat gaat voor). */
  async function scanValues(c: Candidate | null, r: Recognition, lang: Lang, variant: Variant | null): Promise<Partial<CardInput>> {
    const { language: _lang, set_code: _set, ...extra } = newCardDefaults
    void _lang
    void _set
    return { ...extra, ...(await draftFromScan(r, c, lang)), variant }
  }

  /** Eerst het formulier openen. */
  async function chooseSingle(c: Candidate | null, r: Recognition, lang: Lang, variant: Variant | null, force = false): Promise<void> {
    const earlier = earlierFor(c, r, variant)
    if (earlier && !force) {
      setDup({ candidate: c, recognition: r, lang, earlier, action: 'edit', variant })
      return
    }
    setDup(null)
    setDraft({ values: await scanValues(c, r, lang, variant), position: null, choice: { rec: r, candidates: phase.kind === 'single' ? phase.candidates : [] } })
  }

  /** Meteen toevoegen (zonder formulier); daarna de camera weer open als de foto daarvan kwam. Fouten gaan naar het resultaat. */
  async function addSingle(c: Candidate | null, r: Recognition, lang: Lang, variant: Variant | null, force = false): Promise<void> {
    const earlier = earlierFor(c, r, variant)
    if (earlier && !force) {
      setDup({ candidate: c, recognition: r, lang, earlier, action: 'add', variant })
      return
    }
    const values = await scanValues(c, r, lang, variant)
    const rows = await insertCards([{ ...EMPTY_CARD, ...values, name: (values.name ?? '').slice(0, 200) || 'Unknown card', sort_order: nextSortOrder }])
    rememberAdded(rows)
    void addedQuietly(rows)
    saveScanPhoto(rows, image?.blob ?? null)
    // Andere kaart dan de app voorstelde: onthouden voor de volgende keer.
    void recordChoices([{ rec: r, candidates: phase.kind === 'single' ? phase.candidates : [], chosen: c?.key ?? null }])
    const again = lastFromCamera.current
    reset()
    if (again) setCameraOpen(true)
  }

  /** Scanfoto bij de kaart bewaren als je dat koos. Hoofdfoto alleen als er geen officiële afbeelding is. */
  function saveScanPhoto(rows: readonly Card[], photo: Blob | null): void {
    if (!keepPhoto || !photo) return
    for (const row of rows) {
      uploadPhoto(photo, null, { cardId: row.id, label: 'scan', makePrimary: !row.tcgdex_id })
        .then((saved) => setCards((list) => list.map((c) => (c.id === row.id ? { ...c, photos: [...c.photos, saved] } : c))))
        .catch((err: unknown) => {
          console.warn('Scanfoto bewaren mislukt', err)
          setPhotoError(errorText(err, 'Saving the scan photo failed.'))
        })
    }
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
    scanSeq.current += 1
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
        </div>
      </div>

      <div className="scan-modes" role="group" aria-label="Start scanning">
        {[...MODES].sort((a, b) => Number(b.key === mode) - Number(a.key === mode)).map((m) => {
          const Icon = MODE_ICON[m.key]
          return (
            <button key={m.key} type="button" className={`scan-mode${m.key === mode ? ' is-main' : ''}`} disabled={busy} onClick={() => startMode(m.key)}>
              <span className="scan-mode-title">
                <Icon size={m.key === mode ? 22 : 18} />
                {m.title}
              </span>
              <span className="scan-mode-text">{m.text}</span>
            </button>
          )
        })}
      </div>
      <button type="button" className="ghost scan-files" disabled={busy} onClick={() => inputRef.current?.click()}>
        Or choose photos from files
      </button>

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

      {mode === 'queue' && queueError && (
        <p className="error queue-error" role="alert">
          {queueError}
        </p>
      )}

      {/* Losse kaart of binderpagina: de foto en de stand pas zodra er een foto is (eerst alleen de tegels). */}
      {mode !== 'queue' && (image || phase.kind !== 'idle') && (
        <div className="scan-stage">
          {image ? (
            <img className={`scan-photo${mode === 'multi' ? ' wide' : ''}`} src={image.previewUrl} alt="Your photo" />
          ) : (
            <div className={`scan-photo empty${mode === 'multi' ? ' wide' : ''}`} aria-hidden="true" />
          )}
          <div className="scan-actions">
            {busy && <p aria-live="polite">{phase.message}</p>}
            {phase.kind === 'error' && <p className="error" role="alert">{phase.message}</p>}
            {!busy && (
              <button type="button" className="ghost" onClick={() => setCameraOpen(true)}>
                New photo
              </button>
            )}
            {v2 && mode === 'single' && (
              <label className="check">
                <input type="checkbox" checked={keepPhoto} onChange={(e) => setKeepPhoto(e.target.checked)} />
                Also save this scan as a photo of the card
              </label>
            )}
          </div>
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          wide={mode === 'multi'}
          crop={mode !== 'multi'}
          autoCapture={mode === 'queue'}
          onCapture={(file) => {
            if (mode === 'queue') addToQueue(file, true)
            else void processPhoto(file, mode, true)
          }}
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
          onEdit={(values, queueId, choice) => setDraft({ values, position: null, queueId, choice })}
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
          onEdit={(values, position, choice) => setDraft({ values, position, choice })}
          onCancel={reset}
        />
      )}

      {phase.kind === 'single' && (
        <SingleScanResult
          key={phase.resultId}
          recognition={phase.recognition}
          candidates={phase.candidates}
          ownedByKey={ownedByKey}
          earlier={dup?.earlier ?? null}
          onChoose={(c, variant) => chooseSingle(c, phase.recognition, phase.lang, variant)}
          onAdd={(c, variant) => addSingle(c, phase.recognition, phase.lang, variant)}
          onAddAnotherCopy={async () => {
            if (!dup) return
            if (dup.action === 'add') await addSingle(dup.candidate, dup.recognition, dup.lang, dup.variant, true)
            else await chooseSingle(dup.candidate, dup.recognition, dup.lang, dup.variant, true)
          }}
          onReset={reset}
          onSearch={searchAgain}
          onLookAgain={image ? lookAgain : null}
        />
      )}

      {draft && (
        <CardDialog
          card={null}
          initial={draft.values}
          defaultStatus="collection"
          nextSortOrder={nextSortOrder}
          quietAdd
          onClose={() => setDraft(null)}
          onSaved={(rows) => {
            rememberAdded(rows)
            const position = draft.position
            // Gekozen koppeling (eventueel in het formulier aangepast) onthouden als die afwijkt van het voorstel.
            if (draft.choice) void recordChoices([{ ...draft.choice, chosen: rows[0]?.tcgdex_id ?? null }])
            // Uit de snelle wachtrij: die kaart is nu toegevoegd.
            if (draft.queueId) {
              removeItems([draft.queueId])
              setDraft(null)
              return
            }
            // Scanfoto alleen bij een losse scan (niet bij een binderpagina).
            if (position === null) saveScanPhoto(rows, image?.blob ?? null)
            setDraft(null)
            // Losse scan: klaar voor de volgende. Binderpagina: alleen deze kaart afvinken.
            if (position === null) reset()
            else setDonePositions((s) => new Set([...s, position]))
          }}
          onDeleted={() => setDraft(null)}
        />
      )}

      {/* Laatst toegevoegd, zolang er geen foto of scanresultaat in beeld is (24-10-2026). */}
      {phase.kind === 'idle' && !image && (
        <ScanRecent
          cards={cards}
          nextSortOrder={nextSortOrder}
          onChanged={(row) => setCards((list) => (list.some((c) => c.id === row.id) ? list.map((c) => (c.id === row.id ? row : c)) : [...list, row]))}
          onDeleted={(id) => setCards((list) => list.filter((c) => c.id !== id))}
        />
      )}
    </section>
  )
}
