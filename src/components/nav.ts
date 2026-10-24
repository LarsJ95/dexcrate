import type { CSSProperties, JSX } from 'react'
import type { Route } from '../lib/routes'
import type { BadgeKey, NavCounts } from '../lib/navCounts'
import { IconCrate, IconCamera, IconCards, IconHome, IconLayers, IconMore, IconReceipt, IconSettings, IconStar } from './Icons'

export interface NavItem {
  route: Route
  label: string
  Icon: (p: { size?: number }) => JSX.Element
  /** Korte uitleg (tooltip), voor namen die niet vanzelf spreken. */
  hint?: string
  /** Welk getal ernaast staat (zie NavCounts); 0 = niets tonen. */
  badge?: BadgeKey
  /** Kleur van het icoonvak in het menu (energiekleur, nooit geel: dat is voor Scan; 24-10-2026, "gezelliger menu"). */
  tone?: string
}

/** Kleur van een menu-item als --tone op de link (icoonvak, achtergrond en streepje gebruiken hem). */
export function toneStyle(item: NavItem): CSSProperties | undefined {
  return item.tone ? ({ '--tone': item.tone } as CSSProperties) : undefined
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

const OVERVIEW: NavItem = { route: 'overview', label: 'Home', Icon: IconHome, tone: 'var(--energy-fire)' }
const COLLECTION: NavItem = { route: 'collection', label: 'My cards', Icon: IconCards, badge: 'collection', tone: 'var(--energy-water)' }
const SETS: NavItem = { route: 'sets', label: 'Sets', Icon: IconLayers, tone: 'var(--energy-grass)' }
const WISHLIST: NavItem = { route: 'wishlist', label: 'Wishlist', Icon: IconStar, badge: 'wishlist', tone: 'var(--energy-fairy)' }
const BUY_SELL: NavItem = { route: 'transactions', label: 'Trades', Icon: IconReceipt, hint: 'Purchases and sales', tone: 'var(--energy-psychic)' }
/** Pack game (heette tot 24-10-2026 Crate): eigen, opvallend item direct onder Scan (21-10-2026, keuze gebruiker). */
export const CRATE_ITEM: NavItem = { route: 'crate', label: 'Pack game', Icon: IconCrate, hint: 'Open virtual packs with points from your real collection' }
export const SCAN_ITEM: NavItem = { route: 'scan', label: 'Scan', Icon: IconCamera }
export const SETTINGS_ITEM: NavItem = { route: 'settings', label: 'Settings', Icon: IconSettings, hint: 'Settings, backup and import', tone: 'var(--energy-metal)' }

/**
 * Zijbalk in groepen met kopje (18-10-2026). Scan en Pack game staan bovenaan, Settings onderaan. Photo inbox weg
 * (21-10-2026). Kopjes 'Collection' en 'Trading' (24-10-2026): 'My cards' heette net als een item erin.
 */
export const SIDE_GROUPS: NavGroup[] = [
  { title: 'Collection', items: [OVERVIEW, COLLECTION, SETS, WISHLIST] },
  { title: 'Trading', items: [BUY_SELL] },
]

/** Telefoon: dezelfde groepen voor wat niet in de onderbalk past (Pack game staat als grote tegel bovenaan More). */
export const MORE_GROUPS: NavGroup[] = [
  { title: 'Collection', items: [WISHLIST] },
  { title: 'Trading', items: [BUY_SELL] },
  { title: 'Settings', items: [SETTINGS_ITEM] },
]

/** Import, Backup en Admin zitten in Settings: daar licht Settings op. */
export const SETTINGS_ROUTES: readonly Route[] = ['settings', 'import', 'backup', 'admin']

export const TAB_NAV: NavItem[] = [OVERVIEW, COLLECTION, SCAN_ITEM, SETS, { route: 'more', label: 'More', Icon: IconMore }]

const MORE_ROUTES: readonly Route[] = [CRATE_ITEM.route, ...MORE_GROUPS.flatMap((g) => g.items.map((i) => i.route)), ...SETTINGS_ROUTES]

/** Actieve tab: pagina's onder "More" (ook Import en Backup) laten de More-tab oplichten. */
export function isActiveTab(tab: Route, current: Route): boolean {
  if (tab === 'more') return current === 'more' || MORE_ROUTES.includes(current)
  return tab === current
}

/** Iets te doen onder "More" (voor een stip op de More-tab). */
export function moreHasBadge(counts: NavCounts): boolean {
  return counts.crate?.freePack === true || MORE_GROUPS.some((g) => g.items.some((i) => i.badge && counts[i.badge] > 0))
}
