import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { useCardPrice } from '../hooks/useCardPrice'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import type { Lang, SetCard } from '../lib/tcgdex'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { CardZoom } from './CardZoom'
import { ChangeBadge } from './ChangeBadge'
import { IconClose, IconStar } from './Icons'
import { WishlistDialog } from './WishlistDialog'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'

interface Props {
  lang: Lang
  card: SetCard
  setName: string
  /** Aantal in bezit; 0 = ontbreekt. */
  owned: number
  /** Setcode voor de wishlist (bv. MEW). */
  setCode?: string
  onClose: () => void
}

/** Kaart uit een set bekijken (ook als je hem niet hebt): foto, marktprijs en Cardmarket-link. */
export function SetCardSheet({ lang, card, setName, owned, setCode, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [wishOpen, setWishOpen] = useState(false)
  const [wished, setWished] = useState(false)
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

  const image = <CardImage tcgdexId={key} kind="card" name={card.name} detail={`#${card.localId}`} quality="high" />

  return (
    <dialog ref={ref} className="card-sheet" onClose={onClose} onClick={onBackdrop} aria-labelledby="set-card-title">
      {wishOpen && (
        <WishlistDialog
          item={null}
          initial={{
            tcgdex_id: key,
            name: card.name,
            set_code: setCode ?? null,
            card_number: /^\d+$/.test(card.localId) ? String(Number.parseInt(card.localId, 10)) : card.localId,
          }}
          onClose={() => setWishOpen(false)}
          onSaved={() => {
            setWishOpen(false)
            setWished(true)
          }}
        />
      )}
      {zoomOpen && (
        <CardZoom label={card.name} onClose={() => setZoomOpen(false)}>
          {image}
        </CardZoom>
      )}
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id="set-card-title" tabIndex={-1} autoFocus>
            {card.name}
          </h2>
          <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>

        <div className="card-detail">
          <div className="detail-top">
            <div className="detail-image">
              <button type="button" className="foil-wrap zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Enlarge ${card.name}`}>
                {image}
              </button>
            </div>

            <div className="detail-info">
              <p className="detail-set">
                {setName} #{card.localId}
              </p>
              <div className="chips">
                <span className={`chip${owned ? ' status-sold' : ''}`}>{owned ? `Owned ${owned}×` : 'Missing'}</span>
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
                <button type="button" className="small-btn wish-add" onClick={() => setWishOpen(true)} disabled={wished}>
                  <IconStar size={16} />
                  {wished ? 'On your wishlist' : 'Add to wishlist'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
