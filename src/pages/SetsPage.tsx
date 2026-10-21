import { useEffect, useMemo, useState, type JSX, type KeyboardEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { IconSearch, IconStar } from '../components/Icons'
import { usePinnedSets } from '../hooks/usePinnedSets'
import { PIN_LANG, pinHref, pinKey } from '../lib/pinnedSets'
import { SearchClear } from '../components/SearchClear'
import { SetIcon } from '../components/SetIcon'
import { listCards } from '../lib/db'
import { hpLevel } from '../lib/trainer'
import { looksLikeAbbr, suggestSets } from '../lib/setSearch'
import { STORED_SCOPES, openingScope, type SetScope } from '../lib/setsScope'
import { digitalSetIds, getSetList, LANGS, resolveSetId, setOfKey, type Lang, type SetSummary } from '../lib/tcgdex'
import type { Card } from '../lib/types'
import { Loading } from '../components/Loading'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { useSavedScroll, useScrollMemory } from '../hooks/useScrollMemory'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { errorText } from '../lib/errors'

type SortKey = 'newest' | 'oldest' | 'progress' | 'name'
const SORT_KEYS: readonly SortKey[] = ['newest', 'oldest', 'progress', 'name']

interface Row {
  setId: string
  summary: SetSummary
  /** Positie in de API-lijst; die loopt ongeveer van oud naar nieuw. */
  order: number
  owned: number
}

const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-tw': 'Chinese (T)',
  'zh-cn': 'Chinese (S)',
}

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 0 })

/** Unieke kaarten in bezit (niet verkocht) per taal → set. */
function ownedBySet(cards: readonly Card[]): Map<Lang, Map<string, Set<string>>> {
  const out = new Map<Lang, Map<string, Set<string>>>()
  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card' || !c.tcgdex_id) continue
    const s = setOfKey(c.tcgdex_id)
    if (!s) continue
    const perLang = out.get(s.lang) ?? new Map<string, Set<string>>()
    const ids = perLang.get(s.setId) ?? new Set<string>()
    ids.add(s.cardId)
    perLang.set(s.setId, ids)
    out.set(s.lang, perLang)
  }
  return out
}

const ratioOf = (r: Row): number => (r.summary.total ? Math.min(1, r.owned / r.summary.total) : 0)

export function SetsPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [sets, setSets] = useState<{ lang: Lang; list: Map<string, SetSummary>; digital: Set<string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cardsError, setCardsError] = useState<string | null>(null)
  // Je keuze onthouden; zonder keuze opent de lijst op alle sets. Nieuwe sleutel (v2, 21-10-2026): een oude "Started" telt niet meer.
  const [storedScope, setScope] = useStoredChoice<SetScope | 'auto'>('dexcrate:sets-scope:v2', STORED_SCOPES, 'auto')
  const [sort, setSort] = useStoredChoice<SortKey>('dexcrate:sets-sort', SORT_KEYS, 'newest')
  const [query, setQuery] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [active, setActive] = useState(0)
  /** Set gevonden via de officiële afkorting (MEW → 151); alleen Engels. */
  const [abbrHit, setAbbrHit] = useState<{ q: string; setId: string | null } | null>(null)
  const pinned = usePinnedSets()

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((list) => {
        if (!cancelled) setCards(list)
      })
      .catch((err: unknown) => {
        // Sets blijven bekijkbaar; alleen de voortgang ontbreekt.
        if (!cancelled) setCardsError(errorText(err, 'Loading your cards failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([getSetList(lang), digitalSetIds(lang)])
      .then(([list, digital]) => {
        if (!cancelled) setSets({ lang, list, digital })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading sets failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [lang])

  const owned = useMemo(() => ownedBySet(cards ?? []), [cards])

  // Afkorting opzoeken (kort wachten tot je stopt met typen).
  useEffect(() => {
    const q = query.trim()
    if (lang !== 'en' || !looksLikeAbbr(q)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      resolveSetId('en', q)
        .then((setId) => {
          if (!cancelled) setAbbrHit({ q, setId })
        })
        .catch((err: unknown) => console.warn('Afkorting opzoeken mislukt', err))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, lang])
  const abbrSetId = lang === 'en' && abbrHit?.q === query.trim() ? abbrHit.setId : null

  const rows = useMemo<Row[]>(() => {
    if (!sets || sets.lang !== lang) return []
    const mine = owned.get(lang) ?? new Map<string, Set<string>>()
    const out: Row[] = []
    let order = 0
    for (const [id, summary] of sets.list) {
      order += 1
      if (sets.digital.has(id)) continue
      out.push({ setId: id, summary, order, owned: mine.get(id)?.size ?? 0 })
    }
    // Sets waar je kaarten van hebt maar die niet in de lijst staan, toch tonen.
    for (const [id, ids] of mine) {
      if (!sets.list.has(id)) out.push({ setId: id, summary: { id, name: id, logo: null }, order: 0, owned: ids.size })
    }
    return out
  }, [sets, lang, owned])

  // Terug uit een set: weer op dezelfde plek in de lijst (useScrollMemory).
  const scrollSaved = useSavedScroll('sets')
  useScrollMemory('sets', scrollSaved, rows.length > 0, 0)

  const scope = openingScope(storedScope)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) => {
      const ratio = ratioOf(r)
      if (scope === 'owned' && r.owned === 0) return false
      if (scope === 'almost' && !(ratio >= 0.75 && ratio < 1)) return false
      if (scope === 'complete' && ratio < 1) return false
      return !q || r.summary.name.toLowerCase().includes(q) || r.setId.toLowerCase().includes(q) || r.setId === abbrSetId
    })
    const sorters: Record<SortKey, (a: Row, b: Row) => number> = {
      newest: (a, b) => b.order - a.order,
      oldest: (a, b) => a.order - b.order,
      progress: (a, b) => ratioOf(b) - ratioOf(a) || b.owned - a.owned,
      name: (a, b) => a.summary.name.localeCompare(b.summary.name, 'en'),
    }
    return [...list].sort(sorters[sort])
  }, [rows, scope, sort, query, abbrSetId])

  const suggestions = useMemo(
    () => suggestSets(rows.map((r) => ({ ...r, name: r.summary.name })), query, 6, abbrSetId),
    [rows, query, abbrSetId],
  )
  const showSuggest = suggestOpen && suggestions.length > 0
  const hrefOf = (setId: string): string => `#/sets/${lang}/${encodeURIComponent(setId)}`

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setSuggestOpen(false)
      return
    }
    if (e.key === 'Enter' && !showSuggest) {
      closeKeyboardOnEnter(e)
      return
    }
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (Math.min(i, suggestions.length - 1) + step + suggestions.length) % suggestions.length)
    }
    if (e.key === 'Enter' && showSuggest) {
      closeKeyboardOnEnter(e)
      window.location.hash = hrefOf(suggestions[Math.min(active, suggestions.length - 1)].setId)
    }
  }

  const counts = useMemo(
    () => ({
      all: rows.length,
      owned: rows.filter((r) => r.owned > 0).length,
      almost: rows.filter((r) => ratioOf(r) >= 0.75 && ratioOf(r) < 1).length,
      complete: rows.filter((r) => ratioOf(r) >= 1).length,
    }),
    [rows],
  )

  /** Aantal sets met kaarten in bezit per taal, voor de taalknoppen. */
  const ownedPerLang = (l: Lang): number => owned.get(l)?.size ?? 0

  if (error) return <p className="page error" role="alert">{error}</p>

  return (
    <section className="page">
      <h1>Sets</h1>
      {cardsError && <p className="notice error">{cardsError}</p>}

      {/* Vastgezette sets (21-10-2026): op de computer in het menu, hier voor telefoon en tablet. */}
      {pinned.length > 0 && (
        <nav className="pinned-sets" aria-label="Pinned sets">
          {pinned.map((p) => (
            <a key={pinKey(p)} className="chip pinned-chip" href={pinHref(p)}>
              <IconStar size={14} />
              {p.name}
              {p.lang !== 'en' && <span className="muted small">{PIN_LANG[p.lang]}</span>}
            </a>
          ))}
        </nav>
      )}

      <div className="segmented lang-switch" role="group" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
            {LANG_LABELS[l]}
            {ownedPerLang(l) > 0 && <span className="count">{ownedPerLang(l)}</span>}
          </button>
        ))}
      </div>

      {/* Keuzerijen (taal, voortgang) direct onder elkaar, zoeken en sorteren eronder (21-10-2026, op verzoek). */}
      <div className="filters">
        <div className="segmented" role="group" aria-label="Filter">
          {(
            [
              ['all', 'All'],
              ['owned', 'Started'],
              ['almost', 'Almost'],
              ['complete', 'Complete'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="search set-search">
          <IconSearch size={18} />
          <input
            type="search"
            placeholder="Search sets, e.g. 151 or MEW"
            aria-label="Search sets"
            enterKeyHint="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggest}
            aria-controls="set-suggestions"
            aria-activedescendant={showSuggest ? `set-suggestion-${Math.min(active, suggestions.length - 1)}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setSuggestOpen(true)
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={onSearchKey}
          />
          <SearchClear value={query} onClear={() => setQuery('')} />
          {showSuggest && (
            <ul id="set-suggestions" className="set-suggestions" role="listbox" aria-label="Suggested sets">
              {suggestions.map((r, i) => {
                const total = r.summary.total ?? 0
                return (
                  <li
                    key={r.setId}
                    id={`set-suggestion-${i}`}
                    role="option"
                    aria-selected={i === Math.min(active, suggestions.length - 1)}
                    // Niet eerst het zoekveld laten blurren (dan verdwijnt de lijst vóór de klik).
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => {
                      window.location.hash = hrefOf(r.setId)
                    }}
                  >
                    <SetIcon key={`${lang}/${r.setId}`} kind="symbol" lang={lang} setId={r.setId} name={r.summary.name} logo={r.summary.logo} />
                    <span className="set-suggestion-name">{r.summary.name}</span>
                    <span className="muted small">{r.owned > 0 ? `${r.owned}/${total || '?'}` : total ? `${total} cards` : ''}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <select className="toolbar-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="progress">Progress</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {!sets || sets.lang !== lang ? (
        <Loading center />
      ) : visible.length === 0 ? (
        <EmptyState
          action={
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                setQuery('')
                setScope('all')
              }}
            >
              Show all sets
            </button>
          }
        >
          No sets match.
        </EmptyState>
      ) : (
        <ul className="set-list">
          {visible.map((r) => {
            const total = r.summary.total ?? 0
            const ratio = ratioOf(r)
            return (
              <li key={r.setId}>
                <a
                  className={`set-row${ratio >= 1 ? ' set-complete' : ''}${r.owned === 0 ? ' set-empty' : ''}`}
                  href={`#/sets/${lang}/${encodeURIComponent(r.setId)}`}
                >
                  <SetIcon key={`${lang}/${r.setId}`} kind="logo" lang={lang} setId={r.setId} name={r.summary.name} logo={r.summary.logo} />
                  <span className="set-info">
                    <span className="set-name">{r.summary.name}</span>
                    {r.owned === 0 && <span className="muted small">{total ? `${total} cards` : ''}</span>}
                    {r.owned > 0 && (
                      <span
                        className="meter"
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={total || 1}
                        aria-valuenow={r.owned}
                        aria-label={`${r.summary.name}: ${r.owned} of ${total || '?'}`}
                      >
                        <span className="meter-fill" data-hp={hpLevel(ratio)} style={{ width: `${ratio * 100}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="set-count">
                    {r.owned > 0 && (
                      <>
                        <span>
                          <strong>{r.owned}</strong>/{total || '?'}
                        </span>
                        {total > 0 && <span className="muted small">{pct.format(ratio)}</span>}
                      </>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
