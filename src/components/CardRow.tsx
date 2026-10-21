import { memo, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import type { MarketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, VARIANT_LABELS, statusBadge, thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { ChangeBadge } from './ChangeBadge'
import { IconCheck } from './Icons'
import { RaritySymbols } from './RaritySymbols'
import { CardSetSymbol } from './SetIcon'

interface Props {
  card: Card
  /** undefined = prijzen worden nog geladen. */
  market?: MarketValue | null
  onOpen: (id: string) => void
  /** Selectiemodus: true/false = (niet) geselecteerd; undefined = geen selectiemodus. */
  selected?: boolean
}

/** Eigen prijs bij de status: vraag-/verkoopprijs of wat je betaalde (zoals CardTile). */
function ownPrice(card: Card): string | null {
  if (card.status !== 'collection' && card.sale_price !== null) return `${card.status === 'sold' ? 'Sold for' : 'Asking'} ${formatEur(card.sale_price)}`
  if (card.purchase_price !== null) return `Paid ${formatEur(card.purchase_price)}`
  return null
}

/** Collection als lijst (21-10-2026, op verzoek): kleine foto, naam, set en uitvoering, marktwaarde rechts. */
function CardRowBase({ card, market, onOpen, selected }: Props): JSX.Element {
  const info = useCardInfo(card.tcgdex_id)
  const setLabel = info?.set.name ?? card.set_code
  const details = [card.variant && card.variant !== 'normal' ? VARIANT_LABELS[card.variant] : null, card.condition ? CONDITION_LABELS[card.condition] : null].filter(Boolean)
  const own = ownPrice(card)
  const badge = statusBadge(card)
  return (
    <li className={`card-row-item${selected ? ' is-selected' : ''}`}>
      <button type="button" className="tx-row card-row" onClick={() => onOpen(card.id)} aria-pressed={selected}>
        <span className="wish-thumb" aria-hidden="true">
          <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} photoPath={thumbPath(card)} detail={card.card_number ? `#${card.card_number}` : null} />
        </span>
        <span className="tx-main">
          <span className="tx-title">
            {card.name}
            <RaritySymbols rarity={info?.rarity} />
            {card.quantity > 1 && <span className="chip">{card.quantity}×</span>}
            {badge && <span className={`chip status-${card.status}`}>{badge}</span>}
            {card.grading_company && (
              <span className="chip">
                {card.grading_company} {card.grade}
              </span>
            )}
          </span>
          <span className="muted small">
            {card.kind === 'card' && <CardSetSymbol tcgdexId={card.tcgdex_id} />}
            {card.kind === 'sealed' ? 'Sealed product' : [setLabel, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
            {details.length > 0 && `, ${details.join(', ')}`}
          </span>
        </span>
        <span className="tx-amounts">
          {card.kind === 'card' && card.tcgdex_id !== null && (
            <span className="tx-amount">
              {market === undefined ? '…' : market ? formatEur(market.value) : '–'}
              {market && <ChangeBadge change={market.change30} />}
            </span>
          )}
          {own && <span className="muted small">{own}</span>}
        </span>
        {selected && (
          <span className="select-badge">
            <IconCheck size={18} />
            <span className="visually-hidden">Selected</span>
          </span>
        )}
      </button>
    </li>
  )
}

export const CardRow = memo(CardRowBase)
