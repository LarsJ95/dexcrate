import type { Card, Variant } from './types'

export type LocationKind = 'binder' | 'box' | 'deck' | 'other'

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  binder: 'Binder',
  box: 'Box',
  deck: 'Deck',
  other: 'Other',
}

export interface Location {
  id: string
  name: string
  kind: LocationKind
  /** Vakken per pagina (binders); null = geen vakindeling (doos, deck). */
  page_size: number | null
  sort_order: number
}

/** Geplande inhoud van één vakje (ook als je de kaart nog niet hebt). */
export interface PlannedSlot {
  id: string
  location_id: string
  page: number
  slot: number
  tcgdex_id: string | null
  label: string
  variant: Variant | null
}

export type Placed = Pick<Card, 'id' | 'name' | 'quantity' | 'tcgdex_id' | 'variant' | 'location_id' | 'location_page' | 'location_slot' | 'ownership'>

const placeKey = (loc: string, page: number, slot: number): string => `${loc}|${page}|${slot}`

/**
 * Dubbele plekken: twee kaartregels op hetzelfde vakje, of één regel met meerdere stuks in één vakje.
 * Alleen kaarten in bezit tellen (verkochte kaarten liggen niet meer in je map).
 */
export function placeConflicts(cards: readonly Placed[]): Map<string, string> {
  const byPlace = new Map<string, Placed[]>()
  for (const c of cards) {
    if (!c.location_id || c.location_page === null || c.location_slot === null || c.ownership !== 'owned') continue
    const k = placeKey(c.location_id, c.location_page, c.location_slot)
    byPlace.set(k, [...(byPlace.get(k) ?? []), c])
  }
  const out = new Map<string, string>()
  for (const list of byPlace.values()) {
    if (list.length > 1) for (const c of list) out.set(c.id, `Same pocket as ${list.filter((o) => o !== c).map((o) => o.name).join(', ')}`)
    else if (list[0].quantity > 1) out.set(list[0].id, `${list[0].quantity} copies in one pocket`)
  }
  return out
}

export interface BinderPocket {
  page: number
  slot: number
  /** Wat er werkelijk ligt (meer dan één = conflict). */
  actual: Placed[]
  planned: PlannedSlot | null
  /** Er ligt iets anders dan gepland. */
  mismatch: boolean
}

/** Pagina's van een map: werkelijke plek en planning naast elkaar; altijd één lege pagina extra om aan te vullen. */
export function binderPages(location: Location, cards: readonly Placed[], planned: readonly PlannedSlot[]): BinderPocket[][] {
  const size = location.page_size ?? 9
  const inLoc = cards.filter((c) => c.location_id === location.id && c.location_page !== null && c.location_slot !== null && c.ownership === 'owned')
  const plan = planned.filter((p) => p.location_id === location.id)
  const lastPage = Math.max(0, ...inLoc.map((c) => c.location_page ?? 0), ...plan.map((p) => p.page))
  const pages: BinderPocket[][] = []
  for (let page = 1; page <= lastPage + 1; page++) {
    const pockets: BinderPocket[] = []
    for (let slot = 1; slot <= size; slot++) {
      const actual = inLoc.filter((c) => c.location_page === page && c.location_slot === slot)
      const p = plan.find((x) => x.page === page && x.slot === slot) ?? null
      const mismatch = Boolean(p?.tcgdex_id && actual.length > 0 && actual.every((c) => c.tcgdex_id !== p.tcgdex_id || (p.variant !== null && c.variant !== p.variant)))
      pockets.push({ page, slot, actual, planned: p, mismatch })
    }
    pages.push(pockets)
  }
  return pages
}

/** Kaarten in een map zonder vakindeling of zonder vakje (bv. doos). */
export function looseCards(location: Location, cards: readonly Placed[]): Placed[] {
  return cards.filter((c) => c.location_id === location.id && c.ownership === 'owned' && (c.location_page === null || c.location_slot === null))
}

/** Eerste vrije vakje (geen kaart en geen planning) in een map. */
export function nextFreePocket(location: Location, cards: readonly Placed[], planned: readonly PlannedSlot[]): { page: number; slot: number } {
  for (const page of binderPages(location, cards, planned)) {
    const free = page.find((p) => p.actual.length === 0 && !p.planned)
    if (free) return { page: free.page, slot: free.slot }
  }
  return { page: 1, slot: 1 }
}

/** Leesbare plek: "Red binder, page 3, pocket 5". */
export function placeLabel(c: Pick<Card, 'location_id' | 'location_page' | 'location_slot'>, locations: ReadonlyMap<string, Location>): string | null {
  if (!c.location_id) return null
  const loc = locations.get(c.location_id)
  if (!loc) return null
  const parts = [loc.name]
  if (c.location_page !== null) parts.push(`page ${c.location_page}`)
  if (c.location_slot !== null) parts.push(`pocket ${c.location_slot}`)
  return parts.join(', ')
}
