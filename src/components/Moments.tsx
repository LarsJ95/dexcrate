import { useEffect, useRef, type CSSProperties, type JSX } from 'react'
import { ENERGY_TYPES, foilStyleFor, rarityRule } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import { burstFrom, confetti, raiseToTop } from '../lib/fx'
import { endMoment, useMoment, type Moment } from '../lib/moments'
import { CardImage } from './CardImage'
import { HoloCard } from './HoloCard'
import { RaritySymbols } from './RaritySymbols'
import { BadgeIcon } from './TrainerCard'
import { spriteUrls } from '../lib/runner'
import { buzz } from '../lib/haptics'

/** Tijdlijn per moment in ms (DESIGN.md §9: beweging ≤ 1,5 s, daarna even zichtbaar om te lezen). */
const REVEAL = { flip: 300, burst: 620, end: 2100 }
const CATCH = { absorb: 520, click: 1350, end: 2300 }
const COMPLETE = { end: 2200 }
const MILESTONE = { burst: 350, end: 2200 }
const GOTCHA = { click: 1350, end: 2300 }
/** Pakje: kaarten draaien om met dit interval (10 kaarten ≈ 1,2 s), daarna even blijven staan. */
const PACK = { step: 120, hold: 1700 }
const DEX = { burst: 500, end: 2600 }

/** Tril per soort moment (alleen Android). */
const BUZZ: Partial<Record<Moment['kind'], number[]>> = {
  reveal: [20],
  badge: [30, 60, 30],
  level: [40, 60, 40, 60, 80],
  achievement: [30, 60, 30],
  dex: [20, 40, 20],
  complete: [60, 80, 60],
}

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
    const pattern = BUZZ[moment.kind]
    if (pattern) buzz(pattern)
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
    } else if (moment.kind === 'milestone') {
      at(MILESTONE.burst, () => target.current && burstFrom(target.current, { colors: ALL_ENERGY, count: 36, speed: 8 }))
      at(MILESTONE.end, () => endMoment(moment.id))
    } else if (moment.kind === 'badge') {
      at(MILESTONE.burst, () => target.current && burstFrom(target.current, { colors: [moment.color, 'var(--gold-a)', '#ffffff'], count: 40, speed: 8 }))
      at(MILESTONE.end, () => endMoment(moment.id))
    } else if (moment.kind === 'pack') {
      const last = moment.cards.length * PACK.step + 300
      const top = moment.cards[moment.cards.length - 1]
      at(last, () => {
        const el2 = target.current?.querySelector('.pack-card:last-child')
        if (!el2) return
        const rank = rarityRule(top?.rarity).rank
        burstFrom(el2, { colors: rank >= 9 ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : ALL_ENERGY, count: rank >= 5 ? 40 : 16, speed: rank >= 5 ? 9 : 5 })
        if (rank >= 5) buzz([20, 40, 20])
      })
      at(last + PACK.hold, () => endMoment(moment.id))
    } else if (moment.kind === 'dex' || moment.kind === 'level' || moment.kind === 'achievement') {
      at(DEX.burst, () => target.current && burstFrom(target.current, { colors: moment.kind === 'level' ? ['var(--hp-high)', 'var(--yellow)', '#ffffff'] : ALL_ENERGY, count: 36, speed: 8 }))
      at(DEX.end, () => endMoment(moment.id))
    } else if (moment.kind === 'almost' || moment.kind === 'points') {
      at(DEX.end, () => endMoment(moment.id))
    } else if (moment.kind === 'gotcha') {
      at(GOTCHA.click, () => target.current && burstFrom(target.current, { colors: ['var(--yellow)', '#ffffff', 'var(--ball-red)'], count: 24, speed: 6, gravity: 0.08 }))
      at(GOTCHA.end, () => endMoment(moment.id))
    } else {
      confetti(ALL_ENERGY)
      at(COMPLETE.end, () => endMoment(moment.id))
    }
    return () => {
      for (const t of timers) clearTimeout(t)
      if (el?.matches(':popover-open')) el.hidePopover()
    }
  }, [moment])

  if (moment.kind === 'milestone') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete is-milestone" ref={target}>
          <span className="moment-stamp">Lv. {moment.level}</span>
          <span className="moment-caption">
            <strong>Level up!</strong>
            <span>{moment.caption}</span>
          </span>
        </div>
      </div>
    )
  }

  if (moment.kind === 'pack') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-pack" ref={target}>
          <div className="pack-row">
            {moment.cards.map((p, i) => (
              <div
                key={p.card.id}
                className={`pack-card${i === moment.cards.length - 1 ? ' is-best' : ''}`}
                style={{ '--flip-at': `${i * PACK.step + 150}ms`, '--i': i } as CSSProperties}
              >
                <div className="moment-flip">
                  <span className="moment-face moment-back" aria-hidden="true">
                    <span className="pokeball" />
                  </span>
                  <div className="moment-face moment-front">
                    <HoloCard foil={foilStyleFor(null, p.rarity)}>
                      <CardImage tcgdexId={p.card.tcgdex_id} kind={p.card.kind} name={p.card.name} photoPath={p.card.image_path} />
                    </HoloCard>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="moment-caption">
            <strong>You opened {moment.cards.length} cards!</strong>
            <span>
              Best pull: {moment.cards[moment.cards.length - 1]?.card.name}
              {moment.cards[moment.cards.length - 1]?.rarity && (
                <>
                  {' '}
                  <RaritySymbols rarity={moment.cards[moment.cards.length - 1]?.rarity ?? null} />
                </>
              )}
            </span>
          </p>
        </div>
      </div>
    )
  }

  if (moment.kind === 'dex') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete is-dex" ref={target}>
          <span className="moment-dex">
            <span className="moment-dex-lens" aria-hidden="true" />
            <img src={spriteUrls(moment.dexId, false)[0]} alt="" onError={(e) => (e.currentTarget.src = spriteUrls(moment.dexId, false)[1])} />
            <span className="moment-dex-num">#{String(moment.dexId).padStart(4, '0')}</span>
          </span>
          <span className="moment-caption">
            <strong>New Pokédex entry!</strong>
            <span>
              {moment.name} was registered{moment.more > 0 ? `, plus ${moment.more} more` : ''}
            </span>
          </span>
        </div>
      </div>
    )
  }

  if (moment.kind === 'level') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete is-level" ref={target}>
          <span className="moment-stamp">Lv. {moment.level}</span>
          <span className="moment-caption">
            <strong>
              {moment.trainer} grew to Lv. {moment.level}!
            </strong>
            <span>Keep collecting to level up</span>
          </span>
        </div>
      </div>
    )
  }

  if (moment.kind === 'achievement') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete is-achievement" ref={target}>
          <span className="moment-stamp">Secret found</span>
          <span className="moment-caption">
            <strong>{moment.name}</strong>
            <span>{moment.how}</span>
          </span>
        </div>
      </div>
    )
  }

  if (moment.kind === 'points') {
    return (
      <div ref={layer} className="moment-layer is-toast" popover="manual" role="status">
        <p className="moment-caption">
          <strong className="crate-points-gain">+{moment.amount} Pack points</strong>
          <span>{moment.reason}</span>
        </p>
      </div>
    )
  }

  if (moment.kind === 'almost') {
    return (
      <div ref={layer} className="moment-layer is-toast" popover="manual" role="status">
        <p className="moment-caption">
          <strong>
            Only {moment.left} left in {moment.setName}!
          </strong>
          <span>Missing: {moment.missing.join(', ')}</span>
        </p>
      </div>
    )
  }

  if (moment.kind === 'badge') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-complete is-badge" ref={target}>
          <span className="moment-badge">
            <BadgeIcon badge={{ earned: true, color: moment.color }} />
          </span>
          <span className="moment-caption">
            <strong>You earned the {moment.name}!</strong>
            <span>See your badge case on Overview</span>
          </span>
        </div>
      </div>
    )
  }

  if (moment.kind === 'gotcha') {
    return (
      <div ref={layer} className="moment-layer" popover="manual" role="status">
        <div className="moment-stage is-catch is-gotcha">
          <div className="moment-card" ref={target}>
            <span className="moment-ball pokeball" aria-hidden="true" />
          </div>
          <p className="moment-caption">
            <strong>Gotcha!</strong>
            <span>{moment.name} is on your wishlist</span>
          </p>
        </div>
      </div>
    )
  }

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
                <HoloCard foil={foil} idle>{image}</HoloCard>
              </div>
              <span className="moment-ball pokeball" aria-hidden="true" />
            </>
          ) : (
            <div className="moment-flip">
              <span className="moment-face moment-back" aria-hidden="true">
                <span className="pokeball" />
              </span>
              <div className="moment-face moment-front">
                <HoloCard foil={foil} idle>{image}</HoloCard>
              </div>
            </div>
          )}
        </div>
        <p className="moment-caption">
          <strong>{caught ? 'Caught!' : `You got ${card.name}!`}</strong>
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
