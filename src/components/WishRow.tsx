import type { JSX } from 'react'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { CardSetSymbol } from './SetIcon'
import { useCardPrice } from '../hooks/useCardPrice'
import { cardLanguageOf } from '../lib/cardmarket'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS } from '../lib/types'
import type { WishlistItem } from '../lib/wishlist'

const PRIORITY: Record<1 | 2 | 3, string> = { 1: 'High priority', 2: '', 3: 'Low priority' }

/** Marktprijs van de gezochte uitvoering, met "onder je maximum" als hulp. */
export function WishPrice({ item }: { item: WishlistItem }): JSX.Element | null {
  const price = useCardPrice(item.tcgdex_id)
  if (!item.tcgdex_id) return null
  const market = marketValue(price, item.variant)
  if (price === undefined) return <span className="muted small">Market …</span>
  if (!market) return <span className="muted small">No market price</span>
  const under = item.max_price !== null && market.value <= item.max_price
  return <span className={under ? 'up small' : 'small'}>Market {formatEur(market.value)}{under ? ', within your max.' : ''}</span>
}

/** Cardmarket-knop naast een wens: productpagina als de kaart gekoppeld is, anders zoeken op naam en nummer. */
export function WishCardmarket({ item }: { item: WishlistItem }): JSX.Element {
  const price = useCardPrice(item.tcgdex_id)
  return <CardmarketLink idProduct={price?.idProduct ?? null} searchText={[item.name, item.card_number].filter(Boolean).join(' ')} language={cardLanguageOf(item.language, item.tcgdex_id)} compact />
}

interface Props {
  item: WishlistItem
  owned: number
  incoming: number
  found: boolean
  onOpen: () => void
}

/** Eén wens in de lijst: kaart, set en uitvoering, marktprijs, wat je al hebt en een Cardmarket-knop. */
export function WishRow({ item, owned, incoming, found, onOpen }: Props): JSX.Element {
  return (
    <li className="wish-item">
      <button type="button" className="tx-row wish-row" onClick={onOpen}>
        <span className="wish-thumb" aria-hidden="true">
          <CardImage tcgdexId={item.tcgdex_id} kind="card" name={item.name} detail={item.card_number ? `#${item.card_number}` : null} />
        </span>
        <span className="tx-main">
          <span className="tx-title">
            {item.name}
            {PRIORITY[item.priority] && <span className="chip">{PRIORITY[item.priority]}</span>}
          </span>
          <span className="muted small">
            <CardSetSymbol tcgdexId={item.tcgdex_id} />
            {[
              [item.set_code, item.card_number && `#${item.card_number}`].filter(Boolean).join(' '),
              item.variant ? VARIANT_LABELS[item.variant] : 'Any variant',
              item.language ? LANGUAGE_LABELS[item.language] : null,
              item.min_condition ? `${CONDITION_LABELS[item.min_condition]} or better` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
          <WishPrice item={item} />
        </span>
        <span className="tx-amounts">
          <span className={found ? 'up' : 'tx-amount'}>{found ? 'Found' : `${owned} of ${item.wanted_qty}`}</span>
          {incoming > 0 && <span className="muted small">{incoming} incoming</span>}
          {item.max_price !== null && <span className="muted small">max. {formatEur(item.max_price)}</span>}
        </span>
      </button>
      <WishCardmarket item={item} />
    </li>
  )
}
