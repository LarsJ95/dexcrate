import { useEffect, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { foilStyleFor, type EnergyType } from '../lib/cardTraits'
import { applyPageType } from '../lib/energy'
import type { Mover } from '../lib/prices'
import { formatEur } from '../lib/stats'
import type { CardmarketPrice } from '../lib/tcgdex'
import { thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { ChangeBadge } from './ChangeBadge'
import { HoloCard } from './HoloCard'
import { RarityChip, TypeChip } from './Chips'

/** Bedrag met teken, zodat winst/verlies niet alleen via kleur leesbaar is. */
const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatEur(Math.abs(n))}`

/** Je volgende waardevolste kaarten, klein naast de grootste. */
function RunnersUp({ items, onOpenCard }: { items: readonly Mover<Card>[]; onOpenCard?: (id: string) => void }): JSX.Element | null {
  if (items.length === 0) return null
  return (
    <section className="spotlight-next" aria-label="Your next most valuable cards">
      <span className="stat-label">Next in your top 5</span>
      <ol>
        {items.map(({ card, market }, i) => (
          <li key={card.id}>
            <button type="button" className="spotlight-next-card" onClick={() => onOpenCard?.(card.id)} disabled={!onOpenCard}>
              <span className="spotlight-rank" aria-hidden="true">
                {i + 2}
              </span>
              <span className="spotlight-next-thumb">
                <CardImage
                  tcgdexId={card.tcgdex_id}
                  kind={card.kind}
                  name={card.name}
                  photoPath={thumbPath(card)}
                  detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
                />
              </span>
              <span className="spotlight-next-name">{card.name}</span>
              <span className="spotlight-next-value">
                {formatEur(market.value)} <ChangeBadge change={market.change30} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Je waardevolste kaart groot in beeld op Overview, met prijsinfo en je nummers 2-5; de app kleurt mee met zijn type. */
export function Spotlight({
  item,
  others = [],
  price = null,
  onOpenCard,
  fallbackType = null,
}: {
  item: Mover<Card>
  /** Nummers 2 t/m 5. */
  others?: readonly Mover<Card>[]
  /** Cardmarket-prijsgegevens van deze kaart (30-daags gemiddelde, product-id). */
  price?: CardmarketPrice | null
  onOpenCard?: (id: string) => void
  /** Kleur als deze kaart Colorless is (grijs): het type dat je het meest verzamelt. */
  fallbackType?: EnergyType | null
}): JSX.Element {
  const { card, market } = item
  const info = useCardInfo(card.tcgdex_id)
  const type = info?.types?.[0] ?? null
  const pageType = type && type !== 'Colorless' ? type : (fallbackType ?? type)
  const avg30 = market.reverse ? (price?.avg30Holo ?? null) : (price?.avg30 ?? null)
  const paid = card.purchase_price
  const gain = paid !== null ? market.value - paid : null

  useEffect(() => (pageType ? applyPageType(pageType) : undefined), [pageType])

  return (
    <div className="panel spotlight">
      <button type="button" className="spotlight-card zoom-trigger" onClick={() => onOpenCard?.(card.id)} aria-label={`View ${card.name}`}>
        <HoloCard foil={foilStyleFor(card.variant, info?.rarity)}>
          <CardImage
            tcgdexId={card.tcgdex_id}
            kind={card.kind}
            name={card.name}
            photoPath={thumbPath(card)}
            detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
            quality="high"
          />
        </HoloCard>
      </button>
      <div className="spotlight-info">
        <span className="stat-label">Your most valuable card</span>
        <h2>{card.name}</h2>
        <p className="muted">{[info?.set.name ?? card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}</p>
        <div className="chips">
          {info?.rarity && <RarityChip rarity={info.rarity} />}
          {type && <TypeChip type={type} />}
        </div>
        <p className="spotlight-value">
          {formatEur(market.value)} <ChangeBadge change={market.change30} showLabel />
        </p>
        <dl className="spotlight-facts">
          {avg30 !== null && (
            <div>
              <dt>30-day average</dt>
              <dd>{formatEur(avg30)}</dd>
            </div>
          )}
          {paid !== null && (
            <div>
              <dt>You paid</dt>
              <dd>{formatEur(paid)}</dd>
            </div>
          )}
          {gain !== null && (
            <div>
              <dt>{gain >= 0 ? 'Profit' : 'Loss'}</dt>
              <dd className={gain >= 0 ? 'up' : 'down'}>{signed(gain)}</dd>
            </div>
          )}
          {card.quantity > 1 && (
            <div>
              <dt>You have {card.quantity}×</dt>
              <dd>{formatEur(market.value * card.quantity)}</dd>
            </div>
          )}
        </dl>
        {card.tcgdex_id && <CardmarketLink idProduct={price?.idProduct ?? card.cardmarket_id ?? null} searchText={`${card.name} ${info?.set.name ?? card.set_code ?? ''}`} button />}
      </div>
      <RunnersUp items={others} onOpenCard={onOpenCard} />
    </div>
  )
}
