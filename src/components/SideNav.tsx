import { useEffect, useState, type JSX } from 'react'
import { usePinnedSets } from '../hooks/usePinnedSets'
import type { BadgeKey, NavCounts } from '../lib/navCounts'
import { PIN_LANG, pinHref, pinKey } from '../lib/pinnedSets'
import type { Route } from '../lib/routes'
import { CRATE_ITEM, SCAN_ITEM, SIDE_GROUPS, toneStyle, type NavItem } from './nav'

/** Huidig adres, om een vastgezette set als "de pagina" te markeren. */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

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

/** Icoon in een gekleurd vakje (24-10-2026, "gezelliger menu"); ook op de More-pagina. */
export function NavIcon({ item }: { item: NavItem }): JSX.Element {
  return (
    <span className="side-icon" aria-hidden="true">
      <item.Icon size={18} />
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
  const hash = useHash()
  // Vastgezette sets onder Sets (21-10-2026, op verzoek); is de open set er een van, dan is die regel "de pagina".
  const pinned = usePinnedSets()
  const inPinned = route === 'sets' && !collapsed && pinned.some((p) => pinHref(p) === hash)
  const link = (item: NavItem): JSX.Element => (
    <a
      href={`#/${item.route}`}
      aria-current={route === item.route ? (item.route === 'sets' && inPinned ? 'true' : 'page') : undefined}
      title={collapsed ? item.label : item.hint}
      style={toneStyle(item)}
    >
      <NavIcon item={item} />
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
              <li key={item.route}>
                {link(item)}
                {item.route === 'sets' && !collapsed && pinned.length > 0 && (
                  <ul className="side-sub" aria-label="Pinned sets">
                    {pinned.map((p) => {
                      const href = pinHref(p)
                      return (
                        <li key={pinKey(p)}>
                          <a href={href} aria-current={hash === href ? 'page' : undefined} title={p.name}>
                            <span className="side-sub-name">{p.name}</span>
                            {p.lang !== 'en' && <span className="side-sub-lang">{PIN_LANG[p.lang]}</span>}
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
