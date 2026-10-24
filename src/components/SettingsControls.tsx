import { useId, type JSX, type ReactNode } from 'react'

/*
 * Bouwstenen voor Settings (24-10-2026, op verzoek "veel te uitgebreid"): een lijst zoals de instellingen op je
 * telefoon. Per regel links een kort label (eventueel een korte hint eronder), rechts de keuze.
 */

/** Groep: klein kopje boven een paneel met regels. */
export function Group({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }): JSX.Element {
  const id = useId()
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 id={id} className="settings-group-title">
        {title}
      </h2>
      <div className="panel settings-list">{children}</div>
      {foot}
    </section>
  )
}

/** Eén regel: label links, bediening rechts. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="settings-item">
      <span className="settings-item-text">
        <span className="settings-item-label">{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <span className="settings-item-control">{children}</span>
    </div>
  )
}

/** Keuze uit een paar opties als knoppenrij. */
export function Choice<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: ReactNode; value: T; options: readonly [T, string][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <Row label={label} hint={hint}>
      <span className="segmented" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </span>
    </Row>
  )
}

/** Aan/uit: de hele regel is het tikvlak, het vinkje staat rechts. */
export function Toggle({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode }): JSX.Element {
  return (
    <label className="settings-item settings-switch">
      <span className="settings-item-text">
        <span className="settings-item-label">{children}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** Regel die naar een andere pagina gaat; `external` = in een nieuw tabblad (buiten de app). */
export function LinkRow({ href, children, detail, external = false }: { href: string; children: ReactNode; detail?: ReactNode; external?: boolean }): JSX.Element {
  return (
    <a className="settings-item settings-link" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <span className="settings-item-label">{children}</span>
      {detail && <span className="muted small">{detail}</span>}
      <span className="settings-chevron" aria-hidden="true">
        ›
      </span>
    </a>
  )
}

/** Regel die uitklapt voor wat je zelden nodig hebt (wachtwoord, reset, catalogus …). */
export function More({ label, detail, children, danger = false }: { label: ReactNode; detail?: ReactNode; children: ReactNode; danger?: boolean }): JSX.Element {
  return (
    <details className={`settings-more${danger ? ' is-danger' : ''}`}>
      <summary className="settings-item">
        <span className="settings-item-label">{label}</span>
        {detail && <span className="muted small">{detail}</span>}
        <span className="settings-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="settings-more-body">{children}</div>
    </details>
  )
}
