import { memo, useEffect, type CSSProperties, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { foilStyleFor } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import type { MarketValue } from '../lib/prices'
import { registerRunner, speciesName } from '../lib/runner'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, VARIANT_LABELS, canToggleSold, statusBadge, thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { ChangeBadge } from './ChangeBadge'
import { Foil } from './Foil'
import { IconCheck } from './Icons'
import { RaritySymbols } from './RaritySymbols'

interface Props {
  card: Card
  /** undefined = prijzen worden nog geladen. */
  market?: MarketValue | null
  onOpen: (id: string) => void
  /** Snelle actie: te koop ↔ verkocht. */
  onToggleSold: (id: string) => void
  busy?: boolean
  /** Selectiemodus: true/false = (niet) geselecteerd; undefined = geen selectiemodus. */
  selected?: boolean
  /** Verkopen gaan via transacties (STAP5): geen snelle terugzet-knop bij verkochte kaarten. */
  salesTracked?: boolean
}

/** De prijs die bij de status hoort: vraag-/verkoopprijs, of wat je betaalde. */
function ownPrice(card: Card): { label: string; value: number } | null {
  if (card.status !== 'collection' && card.sale_price !== null) {
    return { label: card.status === 'sold' ? 'Sold for' : 'Asking', value: card.sale_price }
  }
  if (card.purchase_price !== null) return { label: 'Paid', value: card.purchase_price }
  return null
}

function CardTileBase({ card, market, onOpen, onToggleSold, busy, selected, salesTracked }: Props): JSX.Element {
  const info = useCardInfo(card.tcgdex_id)
  const setLabel = info?.set.name ?? card.set_code
  const own = ownPrice(card)
  const details = [
    card.variant && card.variant !== 'normal' ? VARIANT_LABELS[card.variant] : null,
    card.condition ? CONDITION_LABELS[card.condition] : null,
  ].filter(Boolean)
  const showMarket = card.kind === 'card' && card.tcgdex_id !== null
  const selecting = selected !== undefined
  const showToggle = !selecting && canToggleSold(card) && !(salesTracked && card.ownership === 'sold')
  const type = info?.types?.[0]
  // Typestreep onder de kaart in de kleur van het energietype (DESIGN.md §4).
  const typeStyle = type ? ({ '--t': energyColor(type) } as CSSProperties) : undefined

  // Pokémon die je hebt mogen langsrennen (DESIGN.md §9).
  const dexId = info?.dexId ?? null
  const runnerName = info ? speciesName(info.name) : ''
  const owned = card.ownership === 'owned'
  useEffect(() => {
    if (dexId && owned) registerRunner({ dexId, name: runnerName, type: type ?? null })
  }, [dexId, owned, runnerName, type])

  return (
    <li className={`tile status-${card.status}${selected ? ' is-selected' : ''}${type ? ' has-type' : ''}`} style={typeStyle}>
      {/* Naam uit de inhoud (foto-alt of getekende voorkant + badges), zodat die overeenkomt met wat je ziet. */}
      <button type="button" className="tile-open" onClick={() => onOpen(card.id)} aria-pressed={selecting ? selected : undefined}>
        <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} photoPath={thumbPath(card)}
          detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')} />
        {card.status !== 'sold' && <Foil foil={foilStyleFor(card.variant, info?.rarity)} seed={card.id} />}
        {statusBadge(card) && <span className={`status-badge ${card.status}`}>{statusBadge(card)}</span>}
        {card.quantity > 1 && <span className="qty-badge">{card.quantity}×</span>}
        {selected && (
          <span className="select-badge">
            <IconCheck size={18} />
            <span className="visually-hidden">Selected</span>
          </span>
        )}
        {card.grading_company && (
          <span className="grade-badge">
            {card.grading_company} {card.grade}
          </span>
        )}
      </button>

      <div className="tile-body">
        <div className="tile-title">
          <p className="tile-name" title={card.name}>{card.name}</p>
          <RaritySymbols rarity={info?.rarity} />
        </div>
        <p className="tile-meta">
          {card.kind === 'sealed' ? 'Sealed product' : [setLabel, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
          {details.length > 0 && <span>, {details.join(', ')}</span>}
        </p>

        <dl className="tile-prices">
          <div>
            <dt>{own?.label ?? 'Price'}</dt>
            <dd>{own ? formatEur(own.value) : '–'}</dd>
          </div>
          {showMarket && (
            <div className="tile-market">
              <dt>Market{card.grading_company ? ' (raw)' : ''}</dt>
              <dd>
                {market === undefined ? '…' : market ? formatEur(market.value) : '–'}
                {market && <ChangeBadge change={market.change30} />}
              </dd>
            </div>
          )}
        </dl>

        {showToggle && (
          <button
            type="button"
            className={`status-toggle${card.status === 'sold' ? ' on' : ''}`}
            aria-pressed={card.status === 'sold'}
            title={card.status === 'sold' ? 'Move back to for sale' : undefined}
            disabled={busy}
            onClick={() => onToggleSold(card.id)}
          >
            {card.status === 'sold' ? (
              <>
                Sold <IconCheck size={14} />
              </>
            ) : (
              'Mark as sold'
            )}
          </button>
        )}
      </div>
    </li>
  )
}

export const CardTile = memo(CardTileBase)
