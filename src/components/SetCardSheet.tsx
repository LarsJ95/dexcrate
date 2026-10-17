import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import { foilStyleFor } from '../lib/cardTraits'
import { applyPageType } from '../lib/energy'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getSet, type Lang, type SetCard } from '../lib/tcgdex'
import type { CardLanguage } from '../lib/types'
import type { WishlistInput, WishlistItem } from '../lib/wishlist'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { CardZoom } from './CardZoom'
import { ChangeBadge } from './ChangeBadge'
import { HoloCard } from './HoloCard'
import { RarityChip, TypeChip } from './Chips'
import { IconArrowLeft, IconArrowRight, IconClose, IconStar } from './Icons'
import { WishlistDialog } from './WishlistDialog'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'

/** Bladeren door een lijst kaarten (bv. zoekresultaten); null = geen vorige/volgende. */
export interface SheetNav {
  /** Positie vanaf 1. */
  position: number
  total: number
  onPrev: (() => void) | null
  onNext: (() => void) | null
}

interface Props {
  lang: Lang
  card: SetCard
  /** Naam van de set; zonder wordt hij uit de kaartinfo gehaald. */
  setName?: string
  /** Aantal in bezit; 0 = ontbreekt. */
  owned: number
  /** Setcode voor de wishlist (bv. MEW); zonder wordt hij opgezocht via setId. */
  setCode?: string
  /** TCGdex-set-id, om de setcode op te zoeken als setCode ontbreekt. */
  setId?: string
  /** Gezochte taal voor de wishlist (bv. uit het taalfilter). */
  wishLanguage?: CardLanguage | null
  /** Staat al op de wishlist. */
  wished?: boolean
  onWishSaved?: (item: WishlistItem) => void
  /** Met bladeren: grotere foto, ‹ › knoppen, pijltjestoetsen en vegen. */
  nav?: SheetNav
  /** Extra knoppen onder de prijs, bv. "Edit wish". */
  actions?: ReactNode
  onClose: () => void
}

/** Minimale horizontale veegafstand (px) om naar de vorige/volgende kaart te gaan. */
const SWIPE_PX = 60

/** Kaart uit een set bekijken (ook als je hem niet hebt): foto, marktprijs en Cardmarket-link. */
export function SetCardSheet({ lang, card, setName, owned, setCode, setId, wishLanguage = null, wished: wishedBefore = false, onWishSaved, nav, actions, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [wishInitial, setWishInitial] = useState<Partial<WishlistInput> | null>(null)
  // Kaarten die je in dit venster op de wishlist zette (bij bladeren per kaart).
  const [wishedNow, setWishedNow] = useState<ReadonlySet<string>>(new Set())
  const info = useCardInfo(`${lang}/${card.id}`)
  const type = info?.types?.[0] ?? null
  const foil = foilStyleFor(null, info?.rarity)

  // De app kleurt mee met het energietype van de kaart in beeld (DESIGN.md §4).
  useEffect(() => (type ? applyPageType(type) : undefined), [type])
  const wishlist = useWishlistEnabled() === true
  const key = `${lang}/${card.id}`
  const price = useCardPrice(key)
  const normal = marketValue(price, null)
  const reverse = marketValue(price, 'reverse')

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = (): void => ref.current?.close()
  function onBackdrop(e: MouseEvent<HTMLDialogElement>): void {
    if (e.target === e.currentTarget) close()
  }

  const wished = wishedBefore || wishedNow.has(key)

  async function openWish(): Promise<void> {
    let code = setCode ?? null
    if (code === null && setId) {
      try {
        code = (await getSet(lang, setId))?.summary.abbr ?? setId
      } catch (err) {
        console.error('Setinfo ophalen mislukt', err)
        code = setId
      }
    }
    setWishInitial({
      tcgdex_id: key,
      name: card.name,
      set_code: code?.slice(0, 20) ?? null,
      card_number: /^\d+$/.test(card.localId) ? String(Number.parseInt(card.localId, 10)) : card.localId,
      ...(wishLanguage ? { language: wishLanguage } : {}),
    })
  }

  // Bladeren: pijltjestoetsen (ook in de vergrote kaart), niet tijdens invullen van de wishlist.
  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>): void {
    if (!nav || wishInitial) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    if (e.key === 'ArrowLeft' && nav.onPrev) {
      e.preventDefault()
      nav.onPrev()
    } else if (e.key === 'ArrowRight' && nav.onNext) {
      e.preventDefault()
      nav.onNext()
    }
  }

  // Vegen op een touchscreen: links = volgende, rechts = vorige.
  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    swipe.current = nav && e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY } : null
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>): void {
    const start = swipe.current
    swipe.current = null
    if (!start || !nav) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) nav.onNext?.()
    else nav.onPrev?.()
  }

  const image = <CardImage tcgdexId={key} kind="card" name={card.name} detail={`#${card.localId}`} quality="high" />

  return (
    <dialog ref={ref} className={`card-sheet${nav ? ' is-browse' : ''}`} onClose={onClose} onClick={onBackdrop} onKeyDown={onKeyDown} aria-labelledby="set-card-title">
      {wishInitial && (
        <WishlistDialog
          item={null}
          initial={wishInitial}
          onClose={() => setWishInitial(null)}
          onSaved={(saved) => {
            setWishInitial(null)
            setWishedNow((s) => new Set(s).add(key))
            onWishSaved?.(saved)
          }}
        />
      )}
      {zoomOpen && (
        <CardZoom label={card.name} onClose={() => setZoomOpen(false)}>
          <HoloCard foil={foil} interactive>
            {image}
          </HoloCard>
        </CardZoom>
      )}
      <div className="sheet-body" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
        <header className="sheet-head">
          <h2 id="set-card-title" tabIndex={-1} autoFocus>
            {card.name}
          </h2>
          <div className="sheet-head-actions">
            {nav && (
              <div className="sheet-nav" role="group" aria-label="Browse cards">
                <button type="button" className="ghost icon-btn" onClick={() => nav.onPrev?.()} disabled={!nav.onPrev} aria-label="Previous card">
                  <IconArrowLeft />
                </button>
                <span className="muted small" aria-live="polite">
                  {nav.position} of {nav.total}
                </span>
                <button type="button" className="ghost icon-btn" onClick={() => nav.onNext?.()} disabled={!nav.onNext} aria-label="Next card">
                  <IconArrowRight />
                </button>
              </div>
            )}
            <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
              <IconClose />
            </button>
          </div>
        </header>

        <div className="card-detail">
          <div className="detail-top">
            <div className="detail-image">
              <button type="button" className="zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Enlarge ${card.name}`}>
                <HoloCard foil={foil}>{image}</HoloCard>
              </button>
            </div>

            <div className="detail-info">
              <p className="detail-set">
                {setName ?? info?.set.name ?? ''} #{card.localId}
              </p>
              <div className="chips">
                <span className={`chip${owned ? ' status-sold' : ''}`}>{owned ? `Owned ${owned}×` : 'Missing'}</span>
                {info?.rarity && <RarityChip rarity={info.rarity} />}
                {type && <TypeChip type={type} />}
              </div>

              <dl className="detail-prices">
                <div className="detail-market">
                  <dt>Market</dt>
                  <dd>
                    {price === undefined ? '…' : normal ? formatEur(normal.value) : '–'}
                    {normal && <ChangeBadge change={normal.change30} />}
                  </dd>
                </div>
                {reverse && (
                  <div>
                    <dt>Reverse holo</dt>
                    <dd>{formatEur(reverse.value)}</dd>
                  </div>
                )}
              </dl>

              <CardmarketLink idProduct={price?.idProduct ?? null} searchText={`${card.name} ${card.localId}`} />
              {wishlist && (
                <button type="button" className="small-btn wish-add" onClick={() => void openWish()} disabled={wished}>
                  <IconStar size={16} />
                  {wished ? 'On your wishlist' : 'Add to wishlist'}
                </button>
              )}
              {actions}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
