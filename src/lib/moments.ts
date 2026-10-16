import { useSyncExternalStore } from 'react'
import { rarityRule, type EnergyType } from './cardTraits'
import { motionAllowed } from './motion'
import { getCardInfo } from './tcgdex'
import type { Card } from './types'
import { hasWishlist, listWishlist, ownedForWish } from './wishlist'

/** Beloningsmomenten (DESIGN.md §9): één tegelijk, een nieuw moment vervangt het vorige. */
export type Moment =
  | {
      kind: 'reveal'
      id: number
      card: Pick<Card, 'tcgdex_id' | 'kind' | 'name' | 'image_path' | 'set_code' | 'card_number'>
      rarity: string | null
      type: EnergyType | null
      /** Kaart stond op de wishlist: vangen in plaats van omdraaien. */
      caught: boolean
    }
  | { kind: 'complete'; id: number; setName: string }
  /** Mijlpaal: "Lv. 25" met uitleg, bv. "25 cards in 151". */
  | { kind: 'milestone'; id: number; level: number; caption: string }
  /** Toegevoegd aan de wishlist: pokébal wiebelt en klikt dicht. */
  | { kind: 'gotcha'; id: number; name: string }

type NewMoment = Moment extends infer M ? (M extends Moment ? Omit<M, 'id'> : never) : never

let current: Moment | null = null
let seq = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function showMoment(m: NewMoment): void {
  if (!motionAllowed()) return
  current = { ...m, id: ++seq } as Moment
  emit()
}

/** Mijlpalen voor kaarten in één set en voor de hele collectie. */
export const SET_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300] as const
export const COLLECTION_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500] as const

/** Hoogste mijlpaal die nu gehaald is maar nog niet gevierd (boven `celebrated`), of null. */
export function newMilestone(count: number, celebrated: number, steps: readonly number[]): number | null {
  let hit: number | null = null
  for (const s of steps) if (s <= count && s > celebrated) hit = s
  return hit
}

/**
 * Mijlpaal vieren als die nieuw is; onthoudt per sleutel wat al gevierd is. Eerste keer (nog niets
 * onthouden): alleen onthouden, niet vieren, zodat oude voortgang niet ineens een feest wordt.
 */
export function celebrateMilestone(key: string, count: number, steps: readonly number[], caption: (level: number) => string): void {
  let stored: string | null
  try {
    stored = localStorage.getItem(key)
  } catch {
    return // geen opslag: niet bij elk bezoek opnieuw vieren
  }
  const reached = newMilestone(count, 0, steps) ?? 0
  const celebrated = stored === null ? null : Number.parseInt(stored, 10) || 0
  try {
    // Ook omlaag bijwerken (kaarten verkocht), zodat de mijlpaal later opnieuw gevierd kan worden.
    if (celebrated === null || reached !== celebrated) localStorage.setItem(key, String(reached))
  } catch (err) {
    console.warn('Mijlpaal onthouden mislukt', err)
  }
  if (celebrated === null) return
  const level = newMilestone(count, celebrated, steps)
  if (level !== null) showMoment({ kind: 'milestone', level, caption: caption(level) })
}

export function endMoment(id: number): void {
  if (current?.id !== id) return
  current = null
  emit()
}

export function useMoment(): Moment | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
}

/**
 * Na het toevoegen van kaarten: toon de zeldzaamste (draait om), of vang hem als hij op de wishlist stond.
 * Fouten hier mogen het opslaan nooit hinderen; ze worden alleen gelogd.
 */
export async function celebrateNewCards(rows: readonly Card[]): Promise<void> {
  if (!motionAllowed() || rows.length === 0) return
  try {
    const candidates = rows.slice(0, 24)
    const infos = await Promise.all(candidates.map((c) => (c.kind === 'card' && c.tcgdex_id ? getCardInfo(c.tcgdex_id).catch(() => null) : null)))
    let best = 0
    for (let i = 1; i < candidates.length; i++) {
      if (rarityRule(infos[i]?.rarity).rank > rarityRule(infos[best]?.rarity).rank) best = i
    }
    let caught = false
    if (await hasWishlist()) {
      const items = await listWishlist()
      caught = items.some((item) => {
        const have = ownedForWish(item, [candidates[best]])
        return have.owned + have.incoming > 0
      })
    }
    const card = candidates[best]
    showMoment({
      kind: 'reveal',
      card,
      rarity: infos[best]?.rarity ?? null,
      type: infos[best]?.types?.[0] ?? null,
      caught,
    })
  } catch (err) {
    console.warn('Moment na toevoegen overgeslagen', err)
  }
}
