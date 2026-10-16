import type { JSX } from 'react'
import type { Route } from '../lib/routes'
import { IconArchive, IconCrate, IconCamera, IconCards, IconHome, IconImage, IconLayers, IconMore, IconReceipt, IconSettings, IconStar, IconUpload } from './Icons'

export interface NavItem {
  route: Route
  label: string
  Icon: (p: { size?: number }) => JSX.Element
}

const OVERVIEW: NavItem = { route: 'overview', label: 'Overview', Icon: IconHome }
const COLLECTION: NavItem = { route: 'collection', label: 'Collection', Icon: IconCards }
const SCAN: NavItem = { route: 'scan', label: 'Scan', Icon: IconCamera }
const SETS: NavItem = { route: 'sets', label: 'Sets', Icon: IconLayers }

/** Verzamelen: op mobiel onder "More", op desktop in de zijbalk. */
export const COLLECT_ITEMS: NavItem[] = [
  { route: 'wishlist', label: 'Wishlist', Icon: IconStar },
  { route: 'transactions', label: 'Transactions', Icon: IconReceipt },
  { route: 'photos', label: 'Photos', Icon: IconImage },
  { route: 'crate', label: 'Crate', Icon: IconCrate },
]

/** Weinig gebruikt: apart onderaan gegroepeerd. */
export const DATA_ITEMS: NavItem[] = [
  { route: 'import', label: 'Import', Icon: IconUpload },
  { route: 'backup', label: 'Backup', Icon: IconArchive },
  { route: 'settings', label: 'Settings', Icon: IconSettings },
]

export const MORE_ITEMS: NavItem[] = [...COLLECT_ITEMS, ...DATA_ITEMS]

/** Zijbalk in groepen, gescheiden door een lijn. */
export const SIDE_GROUPS: NavItem[][] = [[OVERVIEW, COLLECTION, SCAN, SETS, ...COLLECT_ITEMS], DATA_ITEMS]
export const TAB_NAV: NavItem[] = [OVERVIEW, COLLECTION, SCAN, SETS, { route: 'more', label: 'More', Icon: IconMore }]

/** Actieve tab: pagina's onder "More" laten de More-tab oplichten. */
export function isActiveTab(tab: Route, current: Route): boolean {
  if (tab === 'more') return current === 'more' || MORE_ITEMS.some((m) => m.route === current)
  return tab === current
}
