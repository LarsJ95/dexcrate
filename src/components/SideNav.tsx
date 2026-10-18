import { useEffect, useState, type JSX } from 'react'
import type { NavCounts } from '../lib/navCounts'
import { RECENT_SETS_EVENT, readRecentSets, recentSetHref, type RecentSet } from '../lib/recentSets'
import type { Route } from '../lib/routes'
import { SCAN_ITEM, SIDE_GROUPS, type NavItem } from './nav'

/** Wat het getal betekent, voor schermlezers en de tooltip. */
const BADGE_TEXT: Record<keyof NavCounts, (n: number) => string> = {
  collection: (n) => `${n} ${n === 1 ? 'card' : 'cards'} not linked yet`,
  wishlist: (n) => `${n} ${n === 1 ? 'deal' : 'deals'} within your max. price`,
  photos: (n) => `${n} ${n === 1 ? 'photo' : 'photos'} to link to a card`,
}

/** Getal naast een menu-item; niets bij 0. */
export function NavBadge({ kind, counts }: { kind: keyof NavCounts | undefined; counts: NavCounts }): JSX.Element | null {
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

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function useRecentSets(): RecentSet[] {
  const [sets, setSets] = useState(readRecentSets)
  useEffect(() => {
    const on = (): void => setSets(readRecentSets())
    window.addEventListener(RECENT_SETS_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(RECENT_SETS_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return sets
}

interface Props {
  route: Route
  counts: NavCounts
  /** Ingeklapt: alleen iconen (labels blijven voor schermlezers). */
  collapsed: boolean
}

/** Zijbalk: Scan als hoofdknop, daaronder de pagina's in groepen met kopje; onder Sets je laatste drie sets. */
export function SideNav({ route, counts, collapsed }: Props): JSX.Element {
  const hash = useHash()
  const recent = useRecentSets()
  // Open set staat in de recente sets: die regel is "de pagina", Sets zelf licht dan zachter op.
  const inRecentSet = route === 'sets' && !collapsed && recent.some((s) => recentSetHref(s) === hash)

  const link = (item: NavItem): JSX.Element => (
    <a
      href={`#/${item.route}`}
      aria-current={route === item.route ? (item.route === 'sets' && inRecentSet ? 'true' : 'page') : undefined}
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
      {SIDE_GROUPS.map((group) => (
        <section key={group.title} className="side-group" aria-labelledby={`side-${group.title}`}>
          <h2 className="side-title" id={`side-${group.title}`}>
            {group.title}
          </h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.route}>
                {link(item)}
                {item.route === 'sets' && !collapsed && recent.length > 0 && (
                  <ul className="side-sub" aria-label="Recent sets">
                    {recent.map((s) => {
                      const href = recentSetHref(s)
                      return (
                        <li key={`${s.lang}/${s.setId}`}>
                          <a href={href} aria-current={hash === href ? 'page' : undefined} title={s.name}>
                            {s.name}
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
