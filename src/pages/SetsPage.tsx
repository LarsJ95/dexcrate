import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { IconSearch } from '../components/Icons'
import { listCards } from '../lib/db'
import { digitalSetIds, getSetAbbr, getSetList, LANGS, setOfKey, type Lang, type SetSummary } from '../lib/tcgdex'
import type { Card } from '../lib/types'
import { Loading } from '../components/Loading'

type SortKey = 'newest' | 'oldest' | 'progress' | 'name'
type Scope = 'all' | 'owned' | 'almost' | 'complete'

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

/** Setcode voor sets zonder logo: de officiële afkorting, pas opgehaald als de tegel in beeld komt. */
function SetBadge({ lang, setId }: { lang: Lang; setId: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [abbr, setAbbr] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        getSetAbbr(lang, setId)
          .then((a) => {
            if (!cancelled) setAbbr(a)
          })
          .catch((err: unknown) => console.warn('Setafkorting ophalen mislukt', err))
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [lang, setId])

  return (
    <span ref={ref} className="set-code" title={setId}>
      {abbr ?? setId}
    </span>
  )
}

export function SetsPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [sets, setSets] = useState<{ lang: Lang; list: Map<string, SetSummary>; digital: Set<string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cardsError, setCardsError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((list) => {
        if (!cancelled) setCards(list)
      })
      .catch((err: unknown) => {
        // Sets blijven bekijkbaar; alleen de voortgang ontbreekt.
        if (!cancelled) setCardsError(err instanceof Error ? err.message : 'Loading your cards failed.')
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading sets failed.')
      })
    return () => {
      cancelled = true
    }
  }, [lang])

  const owned = useMemo(() => ownedBySet(cards ?? []), [cards])

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows.filter((r) => {
      const ratio = ratioOf(r)
      if (scope === 'owned' && r.owned === 0) return false
      if (scope === 'almost' && !(ratio >= 0.75 && ratio < 1)) return false
      if (scope === 'complete' && ratio < 1) return false
      return !q || r.summary.name.toLowerCase().includes(q) || r.setId.toLowerCase().includes(q)
    })
    const sorters: Record<SortKey, (a: Row, b: Row) => number> = {
      newest: (a, b) => b.order - a.order,
      oldest: (a, b) => a.order - b.order,
      progress: (a, b) => ratioOf(b) - ratioOf(a) || b.owned - a.owned,
      name: (a, b) => a.summary.name.localeCompare(b.summary.name, 'en'),
    }
    return [...list].sort(sorters[sort])
  }, [rows, scope, sort, query])

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

      <div className="segmented lang-switch" role="group" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
            {LANG_LABELS[l]}
            {ownedPerLang(l) > 0 && <span className="count">{ownedPerLang(l)}</span>}
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="search">
          <IconSearch size={18} />
          <input type="search" placeholder="Search sets" aria-label="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
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
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="progress">Progress</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {!sets || sets.lang !== lang ? (
        <Loading center />
      ) : visible.length === 0 ? (
        <p className="empty">No sets match.</p>
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
                  <span className="set-logo">
                    {r.summary.logo ? (
                      <img
                        src={`${r.summary.logo}.webp`}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.hidden = true
                        }}
                      />
                    ) : (
                      <SetBadge key={`${lang}/${r.setId}`} lang={lang} setId={r.setId} />
                    )}
                  </span>
                  <span className="set-info">
                    <span className="set-name">{r.summary.name}</span>
                    {r.owned > 0 && (
                      <span
                        className="meter"
                        role="meter"
                        aria-valuemin={0}
                        aria-valuemax={total || 1}
                        aria-valuenow={r.owned}
                        aria-label={`${r.summary.name}: ${r.owned} of ${total || '?'}`}
                      >
                        <span className="meter-fill" style={{ width: `${ratio * 100}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="set-count">
                    {r.owned > 0 ? (
                      <>
                        <span>
                          <strong>{r.owned}</strong>/{total || '?'}
                        </span>
                        {total > 0 && <span className="muted small">{pct.format(ratio)}</span>}
                      </>
                    ) : (
                      <span className="muted small">{total ? `${total} cards` : ''}</span>
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
