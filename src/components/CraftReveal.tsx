import { useEffect, useRef, type JSX, type MouseEvent } from 'react'
import { useBackToClose } from '../hooks/useBackToClose'
import { foilStyleFor, rarityRule } from '../lib/cardTraits'
import type { PackPull } from '../lib/crate'
import { onOwnClose } from '../lib/dialog'
import { burstFrom } from '../lib/fx'
import { buzz } from '../lib/haptics'
import { useMotion } from '../lib/motion'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { RarityChip } from './Chips'
import { HoloCard } from './HoloCard'
import { IconClose } from './Icons'

interface Props {
  card: PackPull
  /** Punten die het kostte. */
  cost: number
  onClose: () => void
}

/**
 * Gekochte kaart onthullen (21-10-2026, op verzoek: zoals bij een pakje): de kaart groot met glans, vonken vanaf
 * Double rare. Zelfde opmaak als de Pack opening; geneste popup (boven het lijstje ontbrekende kaarten).
 */
export function CraftReveal({ card, cost, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const motion = useMotion()
  const hit = rarityRule(card.rarity).rank >= 5

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    if (!motion || !cardRef.current) return
    const rank = rarityRule(card.rarity).rank
    const gold = rank >= 9
    buzz(hit ? (gold ? [40, 60, 40] : [20]) : [10])
    if (hit) burstFrom(cardRef.current, { colors: gold ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : ['var(--yellow)', '#ffffff', 'var(--type)'], count: gold ? 70 : 36, speed: gold ? 10 : 8 })
  }, [card.rarity, hit, motion])

  const close = (): void => ref.current?.close()
  useBackToClose(close)
  function onBackdrop(e: MouseEvent<HTMLDialogElement>): void {
    if (e.target === e.currentTarget) close()
  }

  return (
    <dialog ref={ref} className="card-sheet pack-opening stage-reveal craft-reveal" onClose={onOwnClose(onClose)} onClick={onBackdrop} aria-labelledby="craft-reveal-title">
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id="craft-reveal-title">New for your Crate!</h2>
          <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className="pack-stage">
          <div className="pack-current">
            <div ref={cardRef} className={`pack-current-card${hit ? ' is-hit' : ''}`}>
              <HoloCard foil={foilStyleFor(null, card.rarity)}>
                <CatalogKeyPicture cardKey={card.tcgdex_id} image={card.image} name={card.name} quality="high" alt={card.name} fallback={<CardFace name={card.name} detail={card.set_name} />} />
              </HoloCard>
            </div>
          </div>
          <div className="pack-current-info" aria-live="polite">
            <strong>{card.name}</strong>
            <span className="pack-current-meta">
              <RarityChip rarity={card.rarity} />
              <span className="pack-badge is-new">NEW</span>
            </span>
            <span className="muted small">
              {card.set_name ?? ''}
              {cost > 0 ? ` · ${cost.toLocaleString('en-GB')} Crate points` : ''}
            </span>
          </div>
          <footer className="sheet-foot">
            <span className="spacer" />
            <button type="button" className="primary" onClick={close} autoFocus>
              Nice!
            </button>
          </footer>
        </div>
      </div>
    </dialog>
  )
}
