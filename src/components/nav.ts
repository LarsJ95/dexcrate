import type { JSX } from 'react'
import type { Route } from '../lib/routes'
import type { NavCounts } from '../lib/navCounts'
import { IconCrate, IconCamera, IconCards, IconHome, IconImage, IconLayers, IconMore, IconReceipt, IconSettings, IconStar } from './Icons'

export interface NavItem {
  route: Route
  label: string
  Icon: (p: { size?: number }) => JSX.Element
  /** Korte uitleg (tooltip), voor namen die niet vanzelf spreken. */
  hint?: string
  /** Welk getal ernaast staat (zie NavCounts); 0 = niets tonen. */
  badge?: keyof NavCounts
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

const OVERVIEW: NavItem = { route: 'overview', label: 'Overview', Icon: IconHome }
const COLLECTION: NavItem = { route: 'collection', label: 'Collection', Icon: IconCards, badge: 'collection' }
const SETS: NavItem = { route: 'sets', label: 'Sets', Icon: IconLayers }
const WISHLIST: NavItem = { route: 'wishlist', label: 'Wishlist', Icon: IconStar, badge: 'wishlist' }
const BUY_SELL: NavItem = { route: 'transactions', label: 'Buy & sell', Icon: IconReceipt, hint: 'Purchases and sales' }
const PHOTO_INBOX: NavItem = { route: 'photos', label: 'Photo inbox', Icon: IconImage, hint: 'Your own photos, to link to cards', badge: 'photos' }
const CRATE: NavItem = { route: 'crate', label: 'Crate game', Icon: IconCrate, hint: 'Open virtual packs with Crate points' }
export const SCAN_ITEM: NavItem = { route: 'scan', label: 'Scan', Icon: IconCamera }
export const SETTINGS_ITEM: NavItem = { route: 'settings', label: 'Settings', Icon: IconSettings, hint: 'Settings, backup and import' }

/** Zijbalk in groepen met kopje (18-10-2026). Scan staat als knop bovenaan, Settings onderaan. */
export const SIDE_GROUPS: NavGroup[] = [
  { title: 'My cards', items: [OVERVIEW, COLLECTION, SETS, WISHLIST] },
  { title: 'Trade', items: [BUY_SELL] },
  { title: 'Extras', items: [PHOTO_INBOX, CRATE] },
]

/** Telefoon: dezelfde groepen voor wat niet in de onderbalk past. */
export const MORE_GROUPS: NavGroup[] = [
  { title: 'My cards', items: [WISHLIST] },
  { title: 'Trade', items: [BUY_SELL] },
  { title: 'Extras', items: [PHOTO_INBOX, CRATE] },
  { title: 'Settings', items: [SETTINGS_ITEM] },
]

/** Import en Backup zitten in Settings: daar licht Settings op. */
export const SETTINGS_ROUTES: readonly Route[] = ['settings', 'import', 'backup']

export const TAB_NAV: NavItem[] = [OVERVIEW, COLLECTION, SCAN_ITEM, SETS, { route: 'more', label: 'More', Icon: IconMore }]

const MORE_ROUTES: readonly Route[] = [...MORE_GROUPS.flatMap((g) => g.items.map((i) => i.route)), ...SETTINGS_ROUTES]

/** Actieve tab: pagina's onder "More" (ook Import en Backup) laten de More-tab oplichten. */
export function isActiveTab(tab: Route, current: Route): boolean {
  if (tab === 'more') return current === 'more' || MORE_ROUTES.includes(current)
  return tab === current
}

/** Iets te doen onder "More" (voor een stip op de More-tab). */
export function moreHasBadge(counts: NavCounts): boolean {
  return MORE_GROUPS.some((g) => g.items.some((i) => i.badge && counts[i.badge] > 0))
}
