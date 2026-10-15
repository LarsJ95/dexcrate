import type { JSX } from 'react'
import type { Route } from '../lib/routes'
import { IconCamera, IconCards, IconHome, IconImage, IconLayers, IconMore, IconReceipt, IconStar, IconUpload } from './Icons'

export interface NavItem {
  route: Route
  label: string
  Icon: (p: { size?: number }) => JSX.Element
}

const OVERVIEW: NavItem = { route: 'overview', label: 'Overview', Icon: IconHome }
const COLLECTION: NavItem = { route: 'collection', label: 'Collection', Icon: IconCards }
const SCAN: NavItem = { route: 'scan', label: 'Scan', Icon: IconCamera }
const SETS: NavItem = { route: 'sets', label: 'Sets', Icon: IconLayers }

/** Pagina's die op mobiel onder "More" vallen; op desktop staan ze gewoon in de zijbalk. */
export const MORE_ITEMS: NavItem[] = [
  { route: 'wishlist', label: 'Wishlist', Icon: IconStar },
  { route: 'transactions', label: 'Transactions', Icon: IconReceipt },
  { route: 'photos', label: 'Photos', Icon: IconImage },
  { route: 'import', label: 'Import', Icon: IconUpload },
]

export const SIDE_NAV: NavItem[] = [OVERVIEW, COLLECTION, SCAN, SETS, ...MORE_ITEMS]
export const TAB_NAV: NavItem[] = [OVERVIEW, COLLECTION, SCAN, SETS, { route: 'more', label: 'More', Icon: IconMore }]

/** Actieve tab: pagina's onder "More" laten de More-tab oplichten. */
export function isActiveTab(tab: Route, current: Route): boolean {
  if (tab === 'more') return current === 'more' || MORE_ITEMS.some((m) => m.route === current)
  return tab === current
}
