import { useEffect, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { foilStyleFor, type EnergyType } from '../lib/cardTraits'
import { applyPageType } from '../lib/energy'
import type { Mover } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { HoloCard } from './HoloCard'
import { RarityChip, TypeChip } from './Chips'

/** Je waardevolste kaart groot in beeld op Overview; de app kleurt mee met zijn type. */
export function Spotlight({
  item,
  onOpenCard,
  fallbackType = null,
}: {
  item: Mover<Card>
  onOpenCard?: (id: string) => void
  /** Kleur als deze kaart Colorless is (grijs): het type dat je het meest verzamelt. */
  fallbackType?: EnergyType | null
}): JSX.Element {
  const { card, market } = item
  const info = useCardInfo(card.tcgdex_id)
  const type = info?.types?.[0] ?? null
  const pageType = type && type !== 'Colorless' ? type : (fallbackType ?? type)

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
        <p className="spotlight-value">{formatEur(market.value)}</p>
      </div>
    </div>
  )
}
