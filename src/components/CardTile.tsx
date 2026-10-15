import { memo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, STATUS_LABELS, VARIANT_LABELS, type Card } from '../lib/types'
import { CardImage } from './CardImage'

interface Props {
  card: Card
  onOpen: (id: string) => void
  /** Snelle actie: te koop ↔ verkocht. */
  onToggleSold: (id: string) => void
  busy?: boolean
}

/** De prijs die bij de status hoort: vraag-/verkoopprijs, of wat je betaalde. */
function shownPrice(card: Card): { label: string; value: number } | null {
  if (card.status !== 'collection' && card.sale_price !== null) {
    return { label: card.status === 'sold' ? 'Verkocht voor' : 'Vraagprijs', value: card.sale_price }
  }
  if (card.purchase_price !== null) return { label: 'Betaald', value: card.purchase_price }
  return null
}

function CardTileBase({ card, onOpen, onToggleSold, busy }: Props): JSX.Element {
  const info = useCardInfo(card.tcgdex_id)
  const setLabel = info?.set.name ?? card.set_code
  const price = shownPrice(card)
  const details = [
    card.variant && card.variant !== 'normal' ? VARIANT_LABELS[card.variant] : null,
    card.condition ? CONDITION_LABELS[card.condition] : null,
    card.grading_company ? `${card.grading_company} ${card.grade ?? ''}`.trim() : null,
  ].filter(Boolean)

  return (
    <li className={`tile status-${card.status}`}>
      <button type="button" className="tile-open" onClick={() => onOpen(card.id)} aria-label={`${card.name} bewerken`}>
        <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} />
        {card.quantity > 1 && <span className="qty-badge">{card.quantity}×</span>}
        {card.grading_company && <span className="grade-badge">{card.grading_company} {card.grade}</span>}
      </button>
      <div className="tile-body">
        <p className="tile-name" title={card.name}>{card.name}</p>
        <p className="tile-meta">
          {card.kind === 'sealed' ? 'Sealed product' : [setLabel, card.card_number].filter(Boolean).join(' ')}
        </p>
        {details.length > 0 && <p className="tile-meta">{details.join(', ')}</p>}
        <p className="tile-price">
          {price ? (
            <>
              <span className="muted small">{price.label} </span>
              <strong>{formatEur(price.value)}</strong>
            </>
          ) : (
            <span className="muted small">Geen prijs</span>
          )}
        </p>
        <div className="tile-foot">
          {card.status === 'collection' ? (
            <span className="status-pill">{STATUS_LABELS.collection}</span>
          ) : (
            <button
              type="button"
              className={`status-toggle${card.status === 'sold' ? ' on' : ''}`}
              aria-pressed={card.status === 'sold'}
              aria-label={`${card.name}: ${STATUS_LABELS[card.status]}. Klik om te wisselen tussen te koop en verkocht.`}
              disabled={busy}
              onClick={() => onToggleSold(card.id)}
            >
              {STATUS_LABELS[card.status]}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export const CardTile = memo(CardTileBase)
