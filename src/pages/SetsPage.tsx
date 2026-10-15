import { useEffect, useMemo, useState, type JSX } from 'react'
import { listCards } from '../lib/db'
import { getSet, setOfKey, type Lang, type SetSummary } from '../lib/tcgdex'
import type { Card } from '../lib/types'

interface Group {
  lang: Lang
  setId: string
  /** Unieke kaart-ids in bezit. */
  owned: Set<string>
}

interface Row extends Group {
  summary: SetSummary | null
}

type SortKey = 'progress' | 'name' | 'release' | 'owned'
type Filter = 'all' | 'almost' | 'complete'

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 0 })

/** Kaarten in bezit (niet verkocht) gegroepeerd per set. */
function groupOwnedBySet(cards: readonly Card[]): Group[] {
  const map = new Map<string, Group>()
  for (const c of cards) {
    if (c.status === 'sold' || c.kind !== 'card' || !c.tcgdex_id) continue
    const s = setOfKey(c.tcgdex_id)
    if (!s) continue
    const k = `${s.lang}/${s.setId}`
    let g = map.get(k)
    if (!g) {
      g = { lang: s.lang, setId: s.setId, owned: new Set() }
      map.set(k, g)
    }
    g.owned.add(s.cardId)
  }
  return [...map.values()]
}

const ratioOf = (r: Row): number => (r.summary?.total ? Math.min(1, r.owned.size / r.summary.total) : 0)

export function SetsPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('progress')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((list) => {
        if (cancelled) return
        setCards(list)
        return Promise.all(
          groupOwnedBySet(list).map(async (g) => ({
            ...g,
            summary: await getSet(g.lang, g.setId)
              .then((s) => s?.summary ?? null)
              .catch((err: unknown) => {
                console.error(`Set ${g.setId} ophalen mislukt`, err)
                return null
              }),
          })),
        ).then((r) => {
          if (!cancelled) setRows(r)
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading failed.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const list = (rows ?? []).filter((r) => {
      const ratio = ratioOf(r)
      if (filter === 'complete') return ratio >= 1
      if (filter === 'almost') return ratio >= 0.75 && ratio < 1
      return true
    })
    const name = (r: Row): string => r.summary?.name ?? r.setId
    const sorters: Record<SortKey, (a: Row, b: Row) => number> = {
      progress: (a, b) => ratioOf(b) - ratioOf(a) || b.owned.size - a.owned.size,
      owned: (a, b) => b.owned.size - a.owned.size,
      name: (a, b) => name(a).localeCompare(name(b), 'en'),
      release: (a, b) => (b.summary?.releaseDate ?? '').localeCompare(a.summary?.releaseDate ?? ''),
    }
    return [...list].sort(sorters[sort])
  }, [rows, sort, filter])

  const counts = useMemo(() => {
    const all = rows ?? []
    return {
      all: all.length,
      almost: all.filter((r) => ratioOf(r) >= 0.75 && ratioOf(r) < 1).length,
      complete: all.filter((r) => ratioOf(r) >= 1).length,
    }
  }, [rows])

  const unlinked = useMemo(
    () => (cards ?? []).filter((c) => c.status !== 'sold' && c.kind === 'card' && !c.tcgdex_id).length,
    [cards],
  )

  if (error) return <p className="page error" role="alert">{error}</p>
  if (!rows) return <p className="center" aria-live="polite">Laden…</p>

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Sets</h1>
        </div>
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Filter">
          {(
            [
              ['all', 'All sets'],
              ['almost', 'Almost complete'],
              ['complete', 'Complete'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="progress">Progress</option>
          <option value="owned">Cards owned</option>
          <option value="release">Newest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {unlinked > 0 && (
        <p className="notice">
          {unlinked} unlinked {unlinked === 1 ? 'card is' : 'cards are'} not counted.
        </p>
      )}
      {rows.length === 0 && <p className="empty">No linked cards yet.</p>}
      {rows.length > 0 && visible.length === 0 && <p className="empty">No sets match this filter.</p>}

      <ul className="set-list">
        {visible.map((r) => {
          const total = r.summary?.total ?? 0
          const ratio = ratioOf(r)
          const name = r.summary?.name ?? r.setId
          return (
            <li key={`${r.lang}/${r.setId}`}>
              <a className={`set-row${ratio >= 1 ? ' set-complete' : ''}`} href={`#/sets/${r.lang}/${encodeURIComponent(r.setId)}`}>
                <span className="set-logo">
                  {r.summary?.logo ? (
                    <img
                      src={`${r.summary.logo}.webp`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.hidden = true
                      }}
                    />
                  ) : null}
                </span>
                <span className="set-info">
                  <span className="set-name">{name}</span>
                  <span
                    className="meter"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={total || 1}
                    aria-valuenow={r.owned.size}
                    aria-label={`${name}: ${r.owned.size} of ${total || '?'}`}
                  >
                    <span className="meter-fill" style={{ width: `${ratio * 100}%` }} />
                  </span>
                  {r.summary?.releaseDate && <span className="muted small">{r.summary.releaseDate.slice(0, 4)}</span>}
                </span>
                <span className="set-count">
                  <span>
                    <strong>{r.owned.size}</strong>/{total || '?'}
                  </span>
                  {total > 0 && <span className="muted small">{pct.format(ratio)}</span>}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
