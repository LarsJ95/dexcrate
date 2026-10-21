import { useId, useState, type JSX } from 'react'

interface Props {
  legend: string
  /** Eigen lijsten (STAP17). */
  lists: readonly { id: string; name: string }[]
  chosen: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}

/**
 * Eigen lijsten kiezen voor een wens (21-10-2026, op verzoek): standaard één lijst (keuzerondjes, bv. €10 óf €20),
 * meerdere pas na "Add to more lists". Staat de wens al in meerdere lijsten, dan meteen meerdere.
 */
export function ListChoice({ legend, lists, chosen, onChange }: Props): JSX.Element {
  const picked = lists.filter((l) => chosen.has(l.id))
  const [multi, setMulti] = useState(picked.length > 1)
  const group = useId()

  if (multi) {
    const toggle = (id: string, on: boolean): void => {
      const next = new Set(picked.map((l) => l.id))
      if (on) next.add(id)
      else next.delete(id)
      onChange(next)
    }
    return (
      <fieldset className="form-group list-choice">
        <legend>{legend}</legend>
        <div className="filter-checks">
          {lists.map((l) => (
            <label key={l.id} className="check">
              <input type="checkbox" checked={chosen.has(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} />
              {l.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="link-button small"
          onClick={() => {
            setMulti(false)
            onChange(new Set(picked.slice(0, 1).map((l) => l.id)))
          }}
        >
          Just one list
        </button>
      </fieldset>
    )
  }

  return (
    <fieldset className="form-group list-choice">
      <legend>{legend}</legend>
      <div className="filter-checks">
        <label className="check">
          <input type="radio" name={group} checked={picked.length === 0} onChange={() => onChange(new Set())} />
          No list
        </label>
        {lists.map((l) => (
          <label key={l.id} className="check">
            <input type="radio" name={group} checked={chosen.has(l.id)} onChange={() => onChange(new Set([l.id]))} />
            {l.name}
          </label>
        ))}
      </div>
      {lists.length > 1 && (
        <button type="button" className="link-button small" onClick={() => setMulti(true)}>
          Add to more lists
        </button>
      )}
    </fieldset>
  )
}
