import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useBackToClose } from '../hooks/useBackToClose'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { cardLanguageOf } from '../lib/cardmarket'
import { foilStyleFor, rarityRule } from '../lib/cardTraits'
import { PACKS, crateWishInitial, tradeCrateCard, tradeValue, type PackKind, type PackPull } from '../lib/crate'
import { onOwnClose } from '../lib/dialog'
import { errorText } from '../lib/errors'
import { burstFrom } from '../lib/fx'
import { buzz } from '../lib/haptics'
import { useMotion } from '../lib/motion'
import { countsAfter, duplicatePoints, revealOrder, type RevealCard } from '../lib/packOpening'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import type { WishlistInput } from '../lib/wishlist'
import { CardFace } from './CardFace'
import { CardmarketLink } from './CardmarketLink'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { RarityChip } from './Chips'
import { HoloCard } from './HoloCard'
import { IconClose, IconStar } from './Icons'
import { WishlistDialog } from './WishlistDialog'

interface Props {
  pack: PackKind
  pulls: PackPull[]
  /** Lucky pack werd een God pack: na het openscheuren een eigen onthulling (dicht ziet het er gewoon uit). */
  god?: boolean
  /** Aantal per kaart in je Crate vóór dit pakje (voor NEW en "je hebt er nu N"). */
  before: ReadonlyMap<string, number>
  tradeFactor: number
  /** Nog een pakje van dezelfde soort openen; null = niet te betalen of niet mogelijk. */
  onOpenAnother: (() => void) | null
  /** Een volgend pakje wordt al geopend. */
  opening: boolean
  /** Fout bij nog een pakje openen (de pagina erachter is niet te zien). */
  error: string | null
  /** Nieuwe puntenstand na inruilen. */
  onPoints: (points: number) => void
  onClose: () => void
}

type Stage = 'sealed' | 'reveal' | 'summary'

/** Tijd van het openscheuren (ms); zonder animaties meteen door. */
const TEAR_MS = 650

function picture(c: Pick<PackPull, 'tcgdex_id' | 'image' | 'name' | 'set_name'>, quality: 'low' | 'high'): JSX.Element {
  return <CatalogKeyPicture cardKey={c.tcgdex_id} image={c.image} name={c.name} quality={quality} alt={c.name} fallback={<CardFace name={c.name} detail={c.set_name} />} />
}

/**
 * Pack opening in een popup (Crate, 18-10-2026): gesloten pakje → open scheuren (tik of veeg) → kaarten één voor één,
 * zeldzaamste als laatste → overzicht met acties (wishlist, inruilen, Cardmarket, nog een pakje).
 * De kaarten staan al in je Crate; sluiten kan dus altijd.
 */
export function PackOpening({ pack, pulls, god = false, before, tradeFactor, onOpenAnother, opening, error: openError, onPoints, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<number | null>(null)
  const motion = useMotion()
  const wishlist = useWishlistEnabled() === true
  const cards = useMemo(() => revealOrder(pulls, before), [pulls, before])
  const [stage, setStage] = useState<Stage>('sealed')
  const [tearing, setTearing] = useState(false)
  const [index, setIndex] = useState(0)
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(() => countsAfter(cards))
  const [prices, setPrices] = useState<ReadonlyMap<string, CardmarketPrice | null>>(new Map())
  const [selected, setSelected] = useState<number | null>(null)
  const [wishInitial, setWishInitial] = useState<Partial<WishlistInput> | null>(null)
  const [wished, setWished] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // showModal zet de focus op het kruisje; het pakje is de hoofdactie.
    dialog.querySelector<HTMLButtonElement>('.pack-sealed')?.focus()
  }, [])
  const close = (): void => ref.current?.close()
  useBackToClose(close)

  // Prijzen van alle kaarten alvast ophalen (voor het overzicht; meestal gecachet).
  useEffect(() => {
    let cancelled = false
    for (const id of new Set(pulls.map((p) => p.tcgdex_id))) {
      getCardPrice(id)
        .then((price) => {
          if (!cancelled) setPrices((m) => new Map(m).set(id, price))
        })
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${id}`, err)
          if (!cancelled) setPrices((m) => new Map(m).set(id, null))
        })
    }
    return () => {
      cancelled = true
    }
  }, [pulls])

  // Zeldzame kaart in beeld: vonken en trillen (zeldzaamste het meest).
  const current = stage === 'reveal' ? cards[index] : null
  useEffect(() => {
    if (!current || !motion || !cardRef.current) return
    const rank = rarityRule(current.rarity).rank
    if (rank < 5) return
    const gold = rank >= 9
    burstFrom(cardRef.current, { colors: gold ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : ['var(--yellow)', '#ffffff', 'var(--type)'], count: gold ? 70 : 36, speed: gold ? 10 : 8 })
    buzz(gold ? [40, 60, 40] : [20])
  }, [current, motion])

  // God pack: meteen na het openscheuren een grote gouden uitbarsting.
  const godReveal = god && stage === 'reveal' && index === 0
  useEffect(() => {
    if (!godReveal || !motion || !cardRef.current) return
    burstFrom(cardRef.current, { colors: ['var(--gold-a)', 'var(--gold-b)', '#ffffff'], count: 120, speed: 12 })
    buzz([60, 80, 60, 80, 120])
  }, [godReveal, motion])

  function tear(): void {
    if (stage !== 'sealed' || tearing) return
    buzz(15)
    if (!motion) {
      setStage('reveal')
      return
    }
    setTearing(true)
    window.setTimeout(() => {
      setTearing(false)
      setStage('reveal')
    }, TEAR_MS)
  }

  function next(): void {
    if (stage !== 'reveal') return
    if (index < cards.length - 1) setIndex((i) => i + 1)
    else setStage('summary')
  }

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>): void {
    if (wishInitial) return
    if (stage === 'sealed' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      tear()
    } else if (stage === 'reveal' && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      next()
    }
  }

  function onPackDown(e: PointerEvent<HTMLButtonElement>): void {
    swipe.current = e.clientX
  }
  function onPackUp(e: PointerEvent<HTMLButtonElement>): void {
    // Vegen over het pakje scheurt het ook open (tikken gaat via onClick).
    if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) tear()
    swipe.current = null
  }

  async function tradeIn(ids: readonly string[]): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      let points: number | null = null
      const updated = new Map(counts)
      for (const id of ids) {
        const n = (updated.get(id) ?? 0) - 1
        if (n < 1) continue
        points = (await tradeCrateCard(id, n)).points
        updated.set(id, 1)
        setCounts(new Map(updated))
      }
      if (points !== null) {
        onPoints(points)
        buzz([20])
      }
    } catch (err) {
      setError(errorText(err, 'Trading in failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function openWish(c: RevealCard): Promise<void> {
    setWishInitial(await crateWishInitial(c.tcgdex_id, c.name))
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>): void {
    if (e.target === e.currentTarget && stage === 'summary') close()
  }

  const newCount = new Set(cards.filter((c) => c.isNew).map((c) => c.tcgdex_id)).size
  const valueOf = (id: string): number | null => marketValue(prices.get(id) ?? null, null)?.value ?? null
  const total = cards.reduce((sum, c) => sum + (valueOf(c.tcgdex_id) ?? 0), 0)
  const dupPoints = duplicatePoints(cards, counts, tradeFactor)
  const dupIds = [...new Set(cards.map((c) => c.tcgdex_id))].filter((id) => (counts.get(id) ?? 0) > 1)
  const sel = selected !== null ? cards[selected] : null

  return (
    <dialog
      ref={ref}
      className={`card-sheet pack-opening stage-${stage}${god && stage !== 'sealed' ? ' is-god' : ''}`}
      onClose={onOwnClose(onClose)}
      onClick={onBackdrop}
      onKeyDown={onKeyDown}
      aria-labelledby="pack-opening-title"
    >
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id="pack-opening-title">{stage === 'summary' ? 'Your pack' : PACKS[pack].name}</h2>
          {stage === 'reveal' && (
            <span className="muted small pack-count">
              {index + 1} / {cards.length}
            </span>
          )}
          <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>

        {god && stage !== 'sealed' && (
          <p className="pack-god-banner" role="status">
            God pack! Every card is a hit
          </p>
        )}

        {stage === 'sealed' && (
          <div className="pack-sealed-wrap">
            <button
              type="button"
              className={`pack-sealed pack-${pack}${tearing ? ' is-tearing' : ''}`}
              onClick={tear}
              onPointerDown={onPackDown}
              onPointerUp={onPackUp}
              aria-label={`Open your ${PACKS[pack].name}`}
            >
              <span className="pack-sealed-top" aria-hidden="true" />
              <span className="pack-sealed-body" aria-hidden="true">
                <span className="pokeball" />
                <span className="pack-sealed-name">{PACKS[pack].name}</span>
              </span>
            </button>
            <p className="muted">Tap or swipe to open</p>
          </div>
        )}

        {current && (
          <div className="pack-stage">
            <button type="button" className="pack-current" onClick={next} aria-label={`${current.name}, ${current.rarity}. Next card`}>
              <div key={index} ref={cardRef} className={`pack-current-card${rarityRule(current.rarity).rank >= 5 ? ' is-hit' : ''}`}>
                <HoloCard foil={foilStyleFor(null, current.rarity)} idle>{picture(current, 'high')}</HoloCard>
              </div>
            </button>
            <div className="pack-current-info" aria-live="polite">
              <strong>{current.name}</strong>
              <span className="pack-current-meta">
                <RarityChip rarity={current.rarity} />
                {current.isNew ? <span className="pack-badge is-new">NEW</span> : <span className="pack-badge">You have {current.copies}×</span>}
              </span>
              <span className="muted small">{current.set_name ?? ''}</span>
            </div>
            <footer className="sheet-foot">
              <button type="button" className="ghost" onClick={() => setStage('summary')}>
                Skip
              </button>
              <span className="spacer" />
              <button type="button" className="primary" onClick={next} autoFocus>
                {index < cards.length - 1 ? 'Next card' : 'See all cards'}
              </button>
            </footer>
          </div>
        )}

        {stage === 'summary' && (
          <div className="pack-summary-wrap">
            <p className="muted">
              {newCount > 0 ? `${newCount} new for your Crate` : 'No new cards this time'}
              {total > 0 && ` · worth ${formatEur(total)} on Cardmarket`}
            </p>
            <ul className="pack-summary">
              {cards.map((c, i) => {
                const have = counts.get(c.tcgdex_id) ?? 1
                const value = valueOf(c.tcgdex_id)
                return (
                  <li key={`${c.tcgdex_id}-${i}`}>
                    <button type="button" className="pack-tile" aria-pressed={selected === i} onClick={() => setSelected(selected === i ? null : i)}>
                      <HoloCard foil={foilStyleFor(null, c.rarity)}>{picture(c, 'low')}</HoloCard>
                      {c.isNew ? <span className="pack-badge is-new">NEW</span> : have > 1 && <span className="pack-badge">{have}×</span>}
                    </button>
                    <span className="small pack-tile-name">{c.name}</span>
                    <span className="muted small">{prices.has(c.tcgdex_id) ? (value !== null ? formatEur(value) : 'No price') : '…'}</span>
                  </li>
                )
              })}
            </ul>

            {sel && (
              <section className="panel pack-card-actions" aria-label={`Actions for ${sel.name}`}>
                <strong>{sel.name}</strong>
                <div className="cd-actions">
                  {wishlist && (
                    <button type="button" className="small-btn wish-add" onClick={() => void openWish(sel)} disabled={wished.has(sel.tcgdex_id)}>
                      <IconStar size={16} />
                      {wished.has(sel.tcgdex_id) ? 'On your wishlist' : 'Add to wishlist'}
                    </button>
                  )}
                  {(counts.get(sel.tcgdex_id) ?? 1) > 1 && (
                    <button type="button" className="small-btn" onClick={() => void tradeIn([sel.tcgdex_id])} disabled={busy}>
                      Trade in {(counts.get(sel.tcgdex_id) ?? 1) - 1} for {((counts.get(sel.tcgdex_id) ?? 1) - 1) * tradeValue(sel.rarity, tradeFactor)} pts
                    </button>
                  )}
                  <CardmarketLink idProduct={prices.get(sel.tcgdex_id)?.idProduct ?? null} searchText={`${sel.name} ${sel.set_name ?? ''}`} language={cardLanguageOf(null, sel.tcgdex_id)} />
                </div>
              </section>
            )}

            {(error ?? openError) && (
              <p className="error" role="alert">
                {error ?? openError}
              </p>
            )}

            <footer className="sheet-foot">
              {dupPoints > 0 && (
                <button type="button" onClick={() => void tradeIn(dupIds)} disabled={busy}>
                  Trade in duplicates (+{dupPoints} pts)
                </button>
              )}
              <span className="spacer" />
              {onOpenAnother && (
                <button type="button" onClick={onOpenAnother} disabled={opening || busy}>
                  {opening ? 'Opening…' : 'Open another'}
                </button>
              )}
              <button type="button" className="primary" onClick={close}>
                Done
              </button>
            </footer>
          </div>
        )}
      </div>

      {wishInitial && (
        <WishlistDialog
          item={null}
          initial={wishInitial}
          onClose={() => setWishInitial(null)}
          onSaved={(saved) => {
            setWishInitial(null)
            if (saved.tcgdex_id) setWished((s) => new Set(s).add(saved.tcgdex_id as string))
          }}
        />
      )}
    </dialog>
  )
}
