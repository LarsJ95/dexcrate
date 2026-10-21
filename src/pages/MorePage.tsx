import type { JSX } from 'react'
import { CRATE_ITEM, MORE_GROUPS } from '../components/nav'
import { NavBadge } from '../components/SideNav'
import { useNavCounts } from '../hooks/useNavCounts'

/** Mobiel: overige pagina's die niet in de onderbalk passen, in dezelfde groepen als de zijbalk. */
export function MorePage(): JSX.Element {
  const counts = useNavCounts('more')
  return (
    <section className="page">
      <h1>More</h1>
      <nav aria-label="More pages" className="more-nav">
        {/* Crate als grote, kleurige tegel bovenaan (21-10-2026): het spel moet opvallen. */}
        <a className="more-crate" href={`#/${CRATE_ITEM.route}`}>
          <CRATE_ITEM.Icon size={28} />
          <span className="more-text">
            <strong>{CRATE_ITEM.label}</strong>
            <span className="small">
              {counts.crate ? `${counts.crate.points.toLocaleString('en-GB')} Crate points` : CRATE_ITEM.hint}
              {counts.crate?.freePack ? ' · Free pack ready!' : ''}
            </span>
          </span>
        </a>
        {MORE_GROUPS.map((group) => (
          <section key={group.title} className="more-group" aria-labelledby={`more-${group.title}`}>
            <h2 className="side-title" id={`more-${group.title}`}>
              {group.title}
            </h2>
            <ul className="more-list">
              {group.items.map(({ route, label, Icon, hint, badge }) => (
                <li key={route}>
                  <a className="more-link" href={`#/${route}`}>
                    <Icon />
                    <span className="more-text">
                      {label}
                      {hint && <span className="muted small">{hint}</span>}
                    </span>
                    <NavBadge kind={badge} counts={counts} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </section>
  )
}
