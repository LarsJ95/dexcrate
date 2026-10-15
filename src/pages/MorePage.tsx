import type { JSX } from 'react'
import { COLLECT_ITEMS, DATA_ITEMS, type NavItem } from '../components/nav'

const list = (items: NavItem[]): JSX.Element => (
  <ul className="more-list">
    {items.map(({ route, label, Icon }) => (
      <li key={route}>
        <a className="more-link" href={`#/${route}`}>
          <Icon />
          <span>{label}</span>
        </a>
      </li>
    ))}
  </ul>
)

/** Mobiel: overige pagina's die niet in de onderbalk passen. */
export function MorePage(): JSX.Element {
  return (
    <section className="page">
      <h1>More</h1>
      <nav aria-label="More pages" className="more-nav">
        {list(COLLECT_ITEMS)}
        <h2 className="section-title">Data and settings</h2>
        {list(DATA_ITEMS)}
      </nav>
    </section>
  )
}
