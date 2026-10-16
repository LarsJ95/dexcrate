import { useEffect, useId, useMemo, useState, type JSX, type KeyboardEvent } from 'react'
import { looksLikeAbbr, suggestSets, type SetCandidate } from '../lib/setSearch'
import { digitalSetIds, getSetList, resolveSetId, type Lang, type SetSummary } from '../lib/tcgdex'
import { IconClose } from './Icons'
import { SetIcon } from './SetIcon'

interface Option extends SetCandidate {
  summary: SetSummary
}

interface Props {
  /** Gekozen set-id ("sv03.5"), of '' voor alle sets. */
  value: string
  lang: Lang
  onChange: (setId: string) => void
  label?: string
}

/**
 * Set kiezen: typ om te zoeken ("15" → 151, "MEW" → 151) of blader door de hele lijst (nieuwste eerst).
 * Toetsenbord: pijltjes, Enter kiest, Escape sluit.
 */
export function SetPicker({ value, lang, onChange, label = 'Set' }: Props): JSX.Element {
  const id = useId()
  const [sets, setSets] = useState<{ lang: Lang; list: Option[] } | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [abbrHit, setAbbrHit] = useState<{ q: string; setId: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getSetList(lang), digitalSetIds(lang)])
      .then(([list, digital]) => {
        if (cancelled) return
        const out: Option[] = []
        let order = 0
        for (const [setId, summary] of list) {
          order += 1
          if (!digital.has(setId)) out.push({ setId, name: summary.name, owned: 0, order, summary })
        }
        setSets({ lang, list: out })
      })
      .catch((err: unknown) => console.warn('Setlijst ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [lang])

  // Afkorting (MEW, SCR) opzoeken als je even stopt met typen; alleen Engels.
  useEffect(() => {
    const q = text.trim()
    if (lang !== 'en' || !looksLikeAbbr(q)) return
    let cancelled = false
    const t = window.setTimeout(() => {
      resolveSetId('en', q)
        .then((setId) => {
          if (!cancelled) setAbbrHit({ q, setId })
        })
        .catch((err: unknown) => console.warn('Afkorting opzoeken mislukt', err))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [text, lang])

  const list = useMemo(() => (sets?.lang === lang ? sets.list : []), [sets, lang])
  const abbrSetId = abbrHit?.q === text.trim() ? abbrHit.setId : null
  const options = useMemo(
    () => (text.trim() ? suggestSets(list, text, 30, abbrSetId) : [...list].sort((a, b) => b.order - a.order)),
    [list, text, abbrSetId],
  )
  const selected = list.find((o) => o.setId === value) ?? null
  const shown = open && options.length > 0
  const current = Math.min(active, options.length - 1)

  function choose(o: Option): void {
    onChange(o.setId)
    setText('')
    setOpen(false)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (Math.min(i, options.length - 1) + step + options.length) % options.length)
      return
    }
    if (e.key === 'Enter' && shown) {
      e.preventDefault()
      choose(options[current])
    }
  }

  return (
    <div className="set-picker">
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="set-picker-field">
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-activedescendant={shown ? `${id}-opt-${current}` : undefined}
          autoComplete="off"
          placeholder={selected ? selected.name : value || 'All sets (type or pick)'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setText('')
          }}
          onKeyDown={onKey}
          className={value ? 'has-value' : undefined}
        />
        {value && (
          <button type="button" className="ghost icon-btn set-picker-clear" onClick={() => onChange('')} aria-label={`Clear set ${selected?.name ?? value}`}>
            <IconClose size={16} />
          </button>
        )}
        {shown && (
          <ul id={`${id}-list`} className="set-suggestions set-picker-list" role="listbox" aria-label="Sets">
            {options.map((o, i) => (
              <li
                key={o.setId}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === current}
                className={o.setId === value ? 'is-chosen' : undefined}
                onPointerDown={(e) => e.preventDefault()}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <SetIcon key={`${lang}/${o.setId}`} kind="symbol" lang={lang} setId={o.setId} name={o.name} logo={o.summary.logo} />
                <span className="set-suggestion-name">{o.name}</span>
                {o.summary.total ? <span className="muted small">{o.summary.total} cards</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
