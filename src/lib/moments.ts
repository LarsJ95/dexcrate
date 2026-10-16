import { useSyncExternalStore } from 'react'
import { rarityRule, type EnergyType } from './cardTraits'
import { motionAllowed } from './motion'
import { getCardInfo } from './tcgdex'
import type { Card } from './types'
import { hasWishlist, listWishlist, ownedForWish } from './wishlist'

/** Beloningsmomenten (DESIGN.md §9): één tegelijk; meerdere achter elkaar via een korte wachtrij. */
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
  /** Nieuwe badge verdiend. */
  | { kind: 'badge'; id: number; name: string; color: string }
  /** Hele evolutielijn in bezit (Pokédex-nummers van basis tot eindvorm). */
  | { kind: 'evolution'; id: number; path: number[] }
  /** Nieuwe Pokémon in je Pokédex (eerste kaart van deze soort); `more` = nog zoveel andere nieuwe. */
  | { kind: 'dex'; id: number; dexId: number; name: string; more: number }
  /** Trainer-level omhoog. */
  | { kind: 'level'; id: number; level: number; trainer: string }
  /** Verborgen prestatie gehaald. */
  | { kind: 'achievement'; id: number; name: string; how: string }
  /** Meerdere kaarten tegelijk: als pakje openen, zeldzaamste als laatste. */
  | { kind: 'pack'; id: number; cards: PackCard[] }
  /** Bijna een set compleet. */
  | { kind: 'almost'; id: number; setName: string; left: number; missing: string[] }
  /** Crate points verdiend (toast). */
  | { kind: 'points'; id: number; amount: number; reason: string }
  /** Wishlist-kaart onder je max. prijs. */
  | { kind: 'deal'; id: number; name: string; market: number; max: number; tcgdexId: string | null }

export interface PackCard {
  card: Pick<Card, 'id' | 'tcgdex_id' | 'kind' | 'name' | 'image_path' | 'set_code' | 'card_number'>
  rarity: string | null
}

type NewMoment = Moment extends infer M ? (M extends Moment ? Omit<M, 'id'> : never) : never

let current: Moment | null = null
let seq = 0
/** Momenten die wachten tot het huidige klaar is (hoogstens een paar, anders wordt het te veel). */
const queue: Moment[] = []
const MAX_QUEUE = 4
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function showMoment(m: NewMoment): void {
  if (!motionAllowed()) return
  const next = { ...m, id: ++seq } as Moment
  if (current) {
    if (queue.length < MAX_QUEUE) queue.push(next)
    return
  }
  current = next
  emit()
}

const readSet = (key: string): Set<string> | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : new Set(raw.split('|').filter(Boolean))
  } catch {
    return null
  }
}

/**
 * Wat is nieuw sinds de vorige keer? Onthoudt de huidige ids per sleutel en geeft de nieuwe terug.
 * Eerste keer (nog niets onthouden): alleen onthouden en niets teruggeven, zodat oude voortgang geen feest wordt.
 */
export function newSince(key: string, ids: readonly string[]): string[] {
  const known = readSet(key)
  try {
    localStorage.setItem(key, ids.join('|'))
  } catch (err) {
    console.warn('Onthouden mislukt', err)
    return []
  }
  return known === null ? [] : ids.filter((id) => !known.has(id))
}

/** Eén id aan de onthouden lijst toevoegen (zodat hij later niet nog eens als nieuw telt). */
export function addSeen(key: string, id: string): void {
  const known = readSet(key) ?? new Set<string>()
  known.add(id)
  try {
    localStorage.setItem(key, [...known].join('|'))
  } catch (err) {
    console.warn('Onthouden mislukt', err)
  }
}

/** Hoogste bereikte waarde onthouden; geeft true als die nu hoger is dan vorige keer (eerste keer: false). */
export function risenSince(key: string, value: number): boolean {
  let stored: string | null
  try {
    stored = localStorage.getItem(key)
    localStorage.setItem(key, String(value))
  } catch {
    return false
  }
  return stored !== null && value > (Number.parseInt(stored, 10) || 0)
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

const BADGES_KEY = 'dexcrate:badges-earned'

/**
 * Nieuwe badges vieren (hoogstens één moment: de laatst verdiende). Eerste keer alleen onthouden.
 * Kwijtgeraakte badges (kaarten verkocht) worden weer vergeten, zodat ze later opnieuw gevierd kunnen worden.
 */
export function celebrateBadges(earned: readonly { id: string; name: string; color: string }[]): void {
  let stored: string | null
  try {
    stored = localStorage.getItem(BADGES_KEY)
  } catch {
    return
  }
  const known = stored === null ? null : new Set(stored.split(',').filter(Boolean))
  try {
    localStorage.setItem(BADGES_KEY, earned.map((b) => b.id).join(','))
  } catch (err) {
    console.warn('Badges onthouden mislukt', err)
  }
  if (known === null) return
  const fresh = earned.filter((b) => !known.has(b.id))
  const last = fresh[fresh.length - 1]
  if (last) showMoment({ kind: 'badge', name: last.name, color: last.color })
}

const EVOLUTIONS_KEY = 'dexcrate:evolutions-complete'

/** Nieuwe complete evolutielijn vieren (de laatste); eerste keer alleen onthouden. */
export function celebrateEvolutions(complete: readonly number[][]): void {
  let stored: string | null
  try {
    stored = localStorage.getItem(EVOLUTIONS_KEY)
  } catch {
    return
  }
  const keys = complete.map((p) => p.join('>'))
  const known = stored === null ? null : new Set(stored.split('|').filter(Boolean))
  try {
    localStorage.setItem(EVOLUTIONS_KEY, keys.join('|'))
  } catch (err) {
    console.warn('Evolutielijnen onthouden mislukt', err)
  }
  if (known === null) return
  const fresh = complete.filter((p) => !known.has(p.join('>')))
  const last = fresh[fresh.length - 1]
  if (last) showMoment({ kind: 'evolution', path: last })
}

export function endMoment(id: number): void {
  if (current?.id !== id) return
  current = queue.shift() ?? null
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
