import { useState, type JSX, type ReactNode } from 'react'

/** Eén regel in de feitenkolom naast de kaartfoto: label en waarde. */
export interface Fact {
  label: string
  value: ReactNode
}

/**
 * Feitenkolom naast de foto (kaartpopup, ontwerp B van 18-10-2026): grote marktprijs bovenaan,
 * daaronder alle kenmerken uitgelijnd als label/waarde in plaats van losse chips.
 */
export function CardFacts({ price, facts, children }: { price?: ReactNode; facts: readonly Fact[]; children?: ReactNode }): JSX.Element {
  return (
    <div className="cd-facts">
      {price}
      {facts.length > 0 && (
        <dl className="cd-grid">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </div>
  )
}

/** Grote marktprijs met label en beweging. */
export function CardPrice({ label, value, change }: { label: string; value: ReactNode; change?: ReactNode }): JSX.Element {
  return (
    <div className="cd-price">
      <span className="cd-price-label">{label}</span>
      <strong className="cd-price-value">{value}</strong>
      {change}
    </div>
  )
}

/** Inklapblok; de inhoud wordt pas gemaakt (en geladen) als je hem opent. */
export function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <details className="cd-fold" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="cd-fold-title">{title}</span>
        {hint && <span className="cd-fold-hint">{hint}</span>}
      </summary>
      {open && <div className="cd-fold-body">{children}</div>}
    </details>
  )
}
