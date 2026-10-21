import type { JSX } from 'react'
import type { BadgeKey, NavCounts } from '../lib/navCounts'
import type { Route } from '../lib/routes'
import { CRATE_ITEM, SCAN_ITEM, SIDE_GROUPS, type NavItem } from './nav'

/** Wat het getal betekent, voor schermlezers en de tooltip. */
const BADGE_TEXT: Record<BadgeKey, (n: number) => string> = {
  collection: (n) => `${n} ${n === 1 ? 'card' : 'cards'} not linked yet`,
  wishlist: (n) => `${n} ${n === 1 ? 'deal' : 'deals'} within your max. price`,
}

/** Getal naast een menu-item; niets bij 0. */
export function NavBadge({ kind, counts }: { kind: BadgeKey | undefined; counts: NavCounts }): JSX.Element | null {
  const n = kind ? counts[kind] : 0
  if (!kind || n <= 0) return null
  const text = BADGE_TEXT[kind](n)
  return (
    <span className="nav-badge" title={text}>
      <span aria-hidden="true">{n > 99 ? '99+' : n}</span>
      <span className="visually-hidden">, {text}</span>
    </span>
  )
}

interface Props {
  route: Route
  counts: NavCounts
  /** Ingeklapt: alleen iconen (labels blijven voor schermlezers). */
  collapsed: boolean
}

/** Zijbalk: Scan als hoofdknop, daaronder de pagina's in groepen met kopje. */
export function SideNav({ route, counts, collapsed }: Props): JSX.Element {
  const link = (item: NavItem): JSX.Element => (
    <a
      href={`#/${item.route}`}
      aria-current={route === item.route ? 'page' : undefined}
      title={collapsed ? item.label : item.hint}
    >
      <item.Icon />
      <span className="side-label">{item.label}</span>
      <NavBadge kind={item.badge} counts={counts} />
    </a>
  )

  return (
    <nav className="side-nav" aria-label="Main menu">
      <a className="side-scan" href={`#/${SCAN_ITEM.route}`} aria-current={route === 'scan' ? 'page' : undefined} title={collapsed ? SCAN_ITEM.label : undefined}>
        <SCAN_ITEM.Icon />
        <span className="side-label">Scan cards</span>
      </a>
      <a className="side-crate" href={`#/${CRATE_ITEM.route}`} aria-current={route === 'crate' ? 'page' : undefined} title={collapsed ? CRATE_ITEM.label : CRATE_ITEM.hint}>
        <CRATE_ITEM.Icon />
        <span className="side-label side-crate-text">
          {CRATE_ITEM.label}
          {counts.crate && (
            <span className="side-crate-sub">
              <span className="visually-hidden">, </span>
              {counts.crate.points.toLocaleString('en-GB')} pts
            </span>
          )}
        </span>
        {counts.crate?.freePack && (
          <span className="side-crate-free" title="Free pack ready">
            <span aria-hidden="true">Free</span>
            <span className="visually-hidden">, free pack ready</span>
          </span>
        )}
      </a>
      {SIDE_GROUPS.map((group) => (
        <section key={group.title} className="side-group" aria-labelledby={`side-${group.title}`}>
          <h2 className="side-title" id={`side-${group.title}`}>
            {group.title}
          </h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.route}>{link(item)}</li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
