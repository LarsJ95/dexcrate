import { memo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { formatEur } from '../lib/stats'
import type { Purchase, Sale } from '../lib/types'
import { CardImage } from './CardImage'

interface Props {
  item: Sale | Purchase
  onOpen: (id: string) => void
  onToggleSold?: (id: string) => void
  busy?: boolean
}

function CardTileBase({ item, onOpen, onToggleSold, busy }: Props): JSX.Element {
  const info = useCardInfo(item.tcgdex_id)
  const sold = 'sold' in item ? item.sold : null
  const setLabel = info?.set.name ?? item.set_code
  const total = (item.quantity * Math.round(item.unit_price * 100)) / 100

  return (
    <li className={`tile${sold === true ? ' is-sold' : ''}`}>
      <button type="button" className="tile-open" onClick={() => onOpen(item.id)} aria-label={`${item.name} bewerken`}>
        <CardImage tcgdexId={item.tcgdex_id} kind={item.kind} name={item.name} />
        {item.quantity > 1 && <span className="qty-badge">{item.quantity}×</span>}
      </button>
      <div className="tile-body">
        <p className="tile-name" title={item.name}>{item.name}</p>
        <p className="tile-meta">
          {item.kind === 'sealed' ? 'Sealed product' : [setLabel, item.card_number].filter(Boolean).join(' ')}
        </p>
        <p className="tile-price">
          <strong>{formatEur(item.unit_price)}</strong>
          {item.quantity > 1 && <span className="muted"> ({formatEur(total)} totaal)</span>}
        </p>
        <div className="tile-foot">
          <span className="channel">{item.channel ?? 'Geen kanaal'}</span>
          {sold !== null && onToggleSold && (
            <button
              type="button"
              className={`status-toggle${sold ? ' on' : ''}`}
              aria-pressed={sold}
              disabled={busy}
              onClick={() => onToggleSold(item.id)}
            >
              {sold ? 'Verkocht' : 'Te koop'}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export const CardTile = memo(CardTileBase)
