import { useEffect, useRef, type CSSProperties, type JSX } from 'react'
import { ENERGY_TYPES, foilStyleFor, rarityRule } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import { burstFrom, confetti, raiseToTop } from '../lib/fx'
import { endMoment, useMoment, type Moment } from '../lib/moments'
import { CardImage } from './CardImage'
import { HoloCard } from './HoloCard'
import { RaritySymbols } from './RaritySymbols'

/** Tijdlijn per moment in ms (DESIGN.md §9: beweging ≤ 1,5 s, daarna even zichtbaar om te lezen). */
const REVEAL = { flip: 300, burst: 620, end: 2100 }
const CATCH = { absorb: 520, click: 1350, end: 2300 }
const COMPLETE = { end: 2200 }

const ALL_ENERGY = ENERGY_TYPES.filter((t) => t !== 'Colorless').map(energyColor)

/**
 * Laag voor beloningsmomenten: kaart draait om, kaart gevangen, set compleet.
 * Blokkeert niets (geen klikken), staat als popover boven open dialogen.
 */
export function Moments(): JSX.Element | null {
  const moment = useMoment()
  if (!moment) return null
  return <MomentLayer key={moment.id} moment={moment} />
}

function MomentLayer({ moment }: { moment: Moment }): JSX.Element {
  const layer = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = layer.current
    if (el) raiseToTop(el)
    const timers: number[] = []
    const at = (ms: number, fn: () => void): void => {
      timers.push(window.setTimeout(fn, ms))
    }
    if (moment.kind === 'reveal') {
      const rank = rarityRule(moment.rarity).rank
      const color = moment.type ? energyColor(moment.type) : 'var(--yellow)'
      if (moment.caught) {
        at(CATCH.click, () => target.current && burstFrom(target.current, { colors: ['var(--yellow)', '#ffffff', color], count: 30, speed: 7, gravity: 0.08 }))
        at(CATCH.end, () => endMoment(moment.id))
      } else {
        at(REVEAL.burst, () => {
          if (!target.current) return
          const gold = rarityRule(moment.rarity).foil === 'gold'
          burstFrom(target.current, {
            colors: gold ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : [color, '#ffffff', 'var(--yellow)'],
            count: rank >= 9 ? 70 : rank >= 5 ? 40 : 14,
            speed: rank >= 5 ? 10 : 5,
          })
        })
        at(REVEAL.end, () => endMoment(moment.id))
      }
    } else {
      confetti(ALL_ENERGY)
      at(COMPLETE.end, () => endMoment(moment.id))
    }
    return () => {
      for (const t of timers) clearTimeout(t)
      if (el?.matches(':popover-open')) el.hidePopover()
    }
  }, [moment])

  if (moment.kind === 'complete') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete">
          <span className="moment-stamp">Complete</span>
          <span className="moment-caption">{moment.setName}</span>
        </div>
      </div>
    )
  }

  const { card, rarity, type, caught } = moment
  const foil = foilStyleFor(null, rarity)
  const special = rarityRule(rarity).rank >= 5
  const style = {
    '--moment': type ? energyColor(type) : 'var(--yellow)',
    '--flip-at': `${REVEAL.flip}ms`,
    '--absorb-at': `${CATCH.absorb}ms`,
  } as CSSProperties
  const image = (
    <CardImage
      tcgdexId={card.tcgdex_id}
      kind={card.kind}
      name={card.name}
      photoPath={card.image_path}
      detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
    />
  )

  return (
    <div ref={layer} className="moment-layer" popover="manual" role="status" style={style}>
      <div className={`moment-stage ${caught ? 'is-catch' : 'is-reveal'}${special ? ' is-special' : ''}`}>
        {special && !caught && <span className="moment-rays" aria-hidden="true" />}
        <div className="moment-card" ref={target}>
          {caught ? (
            <>
              <div className="moment-catch-card">
                <HoloCard foil={foil}>{image}</HoloCard>
              </div>
              <span className="moment-ball pokeball" aria-hidden="true" />
            </>
          ) : (
            <div className="moment-flip">
              <span className="moment-face moment-back" aria-hidden="true">
                <span className="pokeball" />
              </span>
              <div className="moment-face moment-front">
                <HoloCard foil={foil}>{image}</HoloCard>
              </div>
            </div>
          )}
        </div>
        <p className="moment-caption">
          <strong>{caught ? 'Caught!' : card.name}</strong>
          <span>
            {caught ? `${card.name}, from your wishlist` : 'Added to your collection'}
            {rarity && (
              <>
                {' '}
                <RaritySymbols rarity={rarity} />
              </>
            )}
          </span>
        </p>
      </div>
    </div>
  )
}
