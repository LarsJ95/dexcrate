import type { JSX } from 'react'
import { MORE_ITEMS } from '../components/nav'

/** Mobiel: overige pagina's die niet in de onderbalk passen. */
export function MorePage(): JSX.Element {
  return (
    <section className="page">
      <h1>More</h1>
      <nav aria-label="More pages">
        <ul className="more-list">
          {MORE_ITEMS.map(({ route, label, Icon }) => (
            <li key={route}>
              <a className="more-link" href={`#/${route}`}>
                <Icon />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
