import type { JSX, ReactNode } from 'react'

interface Props {
  /** Kop bij een lege pagina; zonder kop een compacte melding (bv. een filter levert niets op). */
  title?: string
  /** Wat het je oplevert, in één zin. */
  children: ReactNode
  /** Eén knop of link: de volgende stap. */
  action?: ReactNode
}

/** Lege pagina of leeg resultaat: kop, wat het je oplevert en één knop (21-10-2026, op verzoek, idee uit Dex). */
export function EmptyState({ title, children, action }: Props): JSX.Element {
  return (
    <div className={`empty empty-state${title ? '' : ' is-compact'}`}>
      {title && <h2 className="empty-state-title">{title}</h2>}
      <p>{children}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
