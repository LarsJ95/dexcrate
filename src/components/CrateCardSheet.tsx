import { useEffect, useState, type JSX } from 'react'
import { foilStyleFor } from '../lib/cardTraits'
import { tradeValue, type CrateCard } from '../lib/crate'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, getSet, setOfKey, type CardmarketPrice } from '../lib/tcgdex'
import type { WishlistInput } from '../lib/wishlist'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { cardLanguageOf } from '../lib/cardmarket'
import { CardFace } from './CardFace'
import { CardmarketLink } from './CardmarketLink'
import { CardZoom } from './CardZoom'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { RarityChip } from './Chips'
import { HoloCard } from './HoloCard'
import { IconStar } from './Icons'
import { LazyCardPrice } from './LazyCardPrice'
import { Sheet } from './Sheet'
import { WishlistDialog } from './WishlistDialog'

/** Cardmarket-prijs van een catalogus-kaart; undefined = laden, null = onbekend. Alleen als `enabled`. */
function useCratePrice(tcgdexId: string, enabled = true): CardmarketPrice | null | undefined {
  const [state, setState] = useState<{ id: string; price: CardmarketPrice | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getCardPrice(tcgdexId)
      .then((price) => {
        if (!cancelled) setState({ id: tcgdexId, price })
      })
      .catch((err: unknown) => {
        console.warn(`Prijs ophalen mislukt voor ${tcgdexId}`, err)
        if (!cancelled) setState({ id: tcgdexId, price: null })
      })
    return () => {
      cancelled = true
    }
  }, [tcgdexId, enabled])
  return state?.id === tcgdexId ? state.price : undefined
}

/** Prijs onder een kaart in het raster; pas ophalen als de kaart in beeld komt. */
export function CrateTilePrice({ tcgdexId }: { tcgdexId: string }): JSX.Element {
  return <LazyCardPrice cardKey={tcgdexId} className="crate-tile-price" />
}

interface Props {
  card: CrateCard
  busy: boolean
  onTrade: (card: CrateCard) => void
  onClose: () => void
  /** Inruilfactor uit de regels (STAP18: 2). */
  tradeFactor: number
}

/** Eén virtuele kaart groot bekijken, met Cardmarket-prijs en -link. */
export function CrateCardSheet({ card, busy, onTrade, onClose, tradeFactor }: Props): JSX.Element {
  const price = useCratePrice(card.tcgdexId)
  const mv = marketValue(price, null)
  const [zoom, setZoom] = useState(false)
  const wishlist = useWishlistEnabled() === true
  const [wishInitial, setWishInitial] = useState<Partial<WishlistInput> | null>(null)
  const [wished, setWished] = useState(false)

  /** Wishlist met deze kaart als echte kaart (Engels, gekoppeld); setcode = officiële afkorting. */
  async function openWish(): Promise<void> {
    const ref = setOfKey(card.tcgdexId)
    let code: string | null = ref?.setId ?? null
    if (ref) {
      try {
        code = (await getSet(ref.lang, ref.setId))?.summary.abbr ?? ref.setId
      } catch (err) {
        console.warn('Setinfo ophalen mislukt', err)
      }
    }
    const localId = ref ? ref.cardId.slice(ref.setId.length + 1) : ''
    setWishInitial({
      tcgdex_id: card.tcgdexId,
      name: card.name,
      set_code: code?.slice(0, 20) ?? null,
      card_number: /^\d+$/.test(localId) ? String(Number.parseInt(localId, 10)) : localId || null,
      language: ref?.lang === 'en' ? 'en' : null,
    })
  }
  const extra = card.quantity - 1
  const picture = (quality: 'low' | 'high'): JSX.Element => (
    <CatalogKeyPicture cardKey={card.tcgdexId} image={card.image} name={card.name} quality={quality} alt={card.name} fallback={<CardFace name={card.name} detail={card.setName} />} />
  )

  return (
    <Sheet title={card.name} onClose={onClose}>
      <div className="crate-sheet">
        <button type="button" className="crate-sheet-image" onClick={() => setZoom(true)} aria-label={`Show ${card.name} full screen`}>
          <HoloCard foil={foilStyleFor(null, card.rarity)}>{picture('high')}</HoloCard>
        </button>
        <div className="crate-sheet-info">
          <p className="muted">{card.setName ?? 'Unknown set'}</p>
          {card.rarity && <RarityChip rarity={card.rarity} />}
          <dl className="crate-sheet-facts">
            <div>
              <dt>Cardmarket trend</dt>
              <dd>{price === undefined ? '…' : mv ? formatEur(mv.value) : 'No price'}</dd>
            </div>
            {price?.avg30 != null && (
              <div>
                <dt>30-day average</dt>
                <dd>{formatEur(price.avg30)}</dd>
              </div>
            )}
            <div>
              <dt>In your Crate</dt>
              <dd>{card.quantity}×</dd>
            </div>
            {mv && card.quantity > 1 && (
              <div>
                <dt>Total value</dt>
                <dd>{formatEur(mv.value * card.quantity)}</dd>
              </div>
            )}
          </dl>
          <div className="crate-sheet-actions">
            <CardmarketLink idProduct={price?.idProduct ?? null} searchText={`${card.name} ${card.setName ?? ''}`} language={cardLanguageOf(null, card.tcgdexId)} button />
            {wishlist && (
              <button type="button" className="wish-add" onClick={() => void openWish()} disabled={wished}>
                <IconStar size={16} />
                {wished ? 'On your wishlist' : 'Add to wishlist'}
              </button>
            )}
            {extra > 0 && (
              <button type="button" onClick={() => onTrade(card)} disabled={busy}>
                Trade {extra} for {extra * tradeValue(card.rarity, tradeFactor)} pts
              </button>
            )}
          </div>
          <p className="muted small">Virtual card: the price is what the real card costs on Cardmarket.</p>
        </div>
      </div>
      {wishInitial && (
        <WishlistDialog
          item={null}
          initial={wishInitial}
          onClose={() => setWishInitial(null)}
          onSaved={() => {
            setWishInitial(null)
            setWished(true)
          }}
        />
      )}
      {zoom && (
        <CardZoom label={card.name} onClose={() => setZoom(false)}>
          {picture('high')}
        </CardZoom>
      )}
    </Sheet>
  )
}
