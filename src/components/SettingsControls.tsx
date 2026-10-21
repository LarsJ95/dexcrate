import type { JSX, ReactNode } from 'react'

type Scope = 'device' | 'account'

/** Eén blok instellingen; rechtsboven waar het bewaard wordt. `id`: doel van de snelknoppen bovenaan Settings. */
export function Section({ title, scope, children, intro, id }: { title: string; scope: Scope; children: ReactNode; intro?: string; id?: string }): JSX.Element {
  const headingId = `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-title`
  return (
    <section id={id} className="panel settings-section" aria-labelledby={headingId}>
      <header className="settings-head">
        <h2 id={headingId} tabIndex={-1}>
          {title}
        </h2>
        <span className={`settings-scope scope-${scope}`}>{scope === 'device' ? 'This device' : 'Your account'}</span>
      </header>
      {intro && <p className="muted small">{intro}</p>}
      {children}
    </section>
  )
}

/** Keuze uit een paar opties als knoppenrij. */
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly [T, string][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="settings-toggle">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {children}
      </label>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  )
}
