import { useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { BinderScanResult } from '../components/BinderScanResult'
import { CardDialog } from '../components/CardDialog'
import { listCards } from '../lib/db'
import { findCandidates, type Candidate } from '../lib/match'
import {
  draftFromScan,
  prepareImage,
  recognizeCards,
  type PreparedImage,
  type Recognition,
  type ScanMode,
} from '../lib/scan'
import { imageUrl, lookupLang, type Lang } from '../lib/tcgdex'
import { LANGUAGE_LABELS, type Card, type CardInput } from '../lib/types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; message: string }
  | { kind: 'single'; recognition: Recognition; candidates: Candidate[]; lang: Lang }
  | { kind: 'multi'; recognitions: Recognition[]; scanId: number }
  | { kind: 'error'; message: string }

const DEFAULT_CHANNELS = ['Cardmarket', 'WhatsApp', 'Bol.com', 'CatchYourCards']

const MODE_HINT: Record<ScanMode, string> = {
  single: 'Photograph one card straight on, with the bottom edge readable.',
  multi: 'Photograph a full binder page from straight above, without glare on the sleeves.',
}

export function ScanPage(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ScanMode>('single')
  const [cards, setCards] = useState<Card[]>([])
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [draft, setDraft] = useState<{ values: Partial<CardInput>; position: number | null } | null>(null)
  const [donePositions, setDonePositions] = useState<ReadonlySet<number>>(new Set())
  const [added, setAdded] = useState<string[]>([])

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

  const channels = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    for (const c of cards) {
      if (c.purchase_channel) set.add(c.purchase_channel)
      if (c.sale_channel) set.add(c.sale_channel)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'en'))
  }, [cards])

  const ownedByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cards) if (c.tcgdex_id && c.status !== 'sold') map.set(c.tcgdex_id, (map.get(c.tcgdex_id) ?? 0) + c.quantity)
    return map
  }, [cards])

  const nextSortOrder = cards.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || phase.kind === 'working') return
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
        { name: recognition.nameEnglish, set_code: recognition.setCode || null, card_number: recognition.cardNumber || null },
        lang,
      )
      setPhase({ kind: 'single', recognition, candidates, lang })
    } catch (err) {
      console.error(err)
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Scan failed.' })
    }
  }

  async function chooseSingle(c: Candidate | null, r: Recognition, lang: Lang): Promise<void> {
    setDraft({ values: await draftFromScan(r, c, lang), position: null })
  }

  function rememberAdded(rows: Card[]): void {
    setCards((list) => [...list, ...rows])
    setAdded((a) => [...a, ...rows.map((r) => r.name)].slice(-8))
  }

  function reset(): void {
    setPhase({ kind: 'idle' })
    setImage(null)
  }

  const busy = phase.kind === 'working'

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
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        onChange={onFile}
        aria-hidden="true"
      />

      {added.length > 0 && (
        <p className="success" role="status">
          Added: {added.join(', ')}
        </p>
      )}

      <div className="scan-stage">
        {image ? (
          <img className={`scan-photo${mode === 'multi' ? ' wide' : ''}`} src={image.previewUrl} alt="Your photo" />
        ) : (
          <div className={`scan-photo empty${mode === 'multi' ? ' wide' : ''}`} aria-hidden="true" />
        )}
        <div className="scan-actions">
          <button type="button" className="scan-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {phase.kind === 'idle' ? 'Take photo' : 'New photo'}
          </button>
          {busy && <p aria-live="polite">{phase.message}</p>}
          {phase.kind === 'error' && <p className="error" role="alert">{phase.message}</p>}
        </div>
      </div>

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
        <div className="scan-result">
          <div className="panel">
            <span className="stat-label">Herkend</span>
            <p className="scan-name">{phase.recognition.nameEnglish || phase.recognition.namePrinted}</p>
            <p className="muted small">
              {[
                phase.recognition.setCode,
                phase.recognition.cardNumber &&
                  `${phase.recognition.cardNumber}${phase.recognition.setTotal ? `/${phase.recognition.setTotal}` : ''}`,
                phase.recognition.language ? LANGUAGE_LABELS[phase.recognition.language] : null,
              ]
                .filter(Boolean)
                .join(', ')}
              {phase.recognition.confidence !== 'high' && ' (uncertain, please check)'}
            </p>
            {phase.recognition.notes && <p className="muted small">{phase.recognition.notes}</p>}
          </div>

          <h2>Pick the right card</h2>
          {phase.candidates.length === 0 && (
            <p className="muted">No match found. You can add it without a link.</p>
          )}
          <ul className="candidates">
            {phase.candidates.map((c, i) => {
              const owned = ownedByKey.get(c.key)
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    className={`candidate${i === 0 ? ' selected' : ''}`}
                    onClick={() => void chooseSingle(c, phase.recognition, phase.lang)}
                  >
                    {c.image ? (
                      <img src={imageUrl(c.image, 'low') ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span className="card-img placeholder"><span>No image</span></span>
                    )}
                    <span className="cand-name">{c.name}</span>
                    <span className="muted small">{c.setName} {c.localId}</span>
                    <span className="cand-reason small">{i === 0 ? 'Beste match' : c.reason}</span>
                    {owned && <span className="small">Owned {owned}×</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="scan-foot">
            <button type="button" className="ghost" onClick={() => void chooseSingle(null, phase.recognition, phase.lang)}>
              Add without link
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Discard
            </button>
          </div>
        </div>
      )}

      {draft && (
        <CardDialog
          card={null}
          initial={draft.values}
          defaultStatus="collection"
          channels={channels}
          nextSortOrder={nextSortOrder}
          onClose={() => setDraft(null)}
          onSaved={(rows) => {
            rememberAdded(rows)
            const position = draft.position
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
