import type { JSX } from 'react'
import { CONDITION_LABELS, VARIANT_LABELS } from '../lib/types'
import { formatEur } from '../lib/stats'
import type { WishlistItem } from '../lib/wishlist'
import { CardImage } from './CardImage'
import { CardSetSymbol } from './SetIcon'
import { WishCardmarket, WishPrice } from './WishRow'

interface Props {
  item: WishlistItem
  owned: number
  incoming: number
  found: boolean
  onOpen: () => void
}

/** Wishlist als raster met grote kaarten (21-10-2026, op verzoek), zelfde opbouw als de tegels in Collection. */
export function WishTile({ item, owned, incoming, found, onOpen }: Props): JSX.Element {
  const details = [item.variant ? VARIANT_LABELS[item.variant] : 'Any variant', item.min_condition ? `${CONDITION_LABELS[item.min_condition]}+` : null].filter(Boolean)
  return (
    <li className={`tile wish-tile${found ? ' is-found' : ''}`}>
      <button type="button" className="tile-open" onClick={onOpen}>
        <CardImage tcgdexId={item.tcgdex_id} kind="card" name={item.name} detail={item.card_number ? `#${item.card_number}` : null} quality="low" />
        <span className={`status-badge ${found ? 'sold' : 'for_sale'}`}>{found ? 'Found' : `${owned} of ${item.wanted_qty}`}</span>
        {item.priority === 1 && <span className="qty-badge">High</span>}
      </button>
      <div className="tile-body">
        <div className="tile-title">
          <p className="tile-name" title={item.name}>
            {item.name}
          </p>
        </div>
        <p className="tile-meta">
          <CardSetSymbol tcgdexId={item.tcgdex_id} />
          {[item.set_code, item.card_number && `#${item.card_number}`].filter(Boolean).join(' ')}
          {details.length > 0 && <span>, {details.join(', ')}</span>}
        </p>
        <WishPrice item={item} />
        <span className="muted small">
          {item.max_price !== null ? `max. ${formatEur(item.max_price)}` : ''}
          {incoming > 0 ? `${item.max_price !== null ? ' · ' : ''}${incoming} incoming` : ''}
        </span>
        <WishCardmarket item={item} />
      </div>
    </li>
  )
}
