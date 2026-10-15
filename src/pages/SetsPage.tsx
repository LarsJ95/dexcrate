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

const pct = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 0 })

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

export function SetsPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((list) => {
        if (cancelled) return
        setCards(list)
        const groups = groupOwnedBySet(list)
        return Promise.all(
          groups.map(async (g) => ({
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(() => {
    const ratio = (r: Row): number => (r.summary?.total ? r.owned.size / r.summary.total : 0)
    return [...(rows ?? [])].sort((a, b) => ratio(b) - ratio(a) || b.owned.size - a.owned.size)
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
          <p className="muted">Hoeveel van elke set je in bezit hebt (in collectie of te koop).</p>
        </div>
      </div>

      {unlinked > 0 && (
        <p className="notice">
          {unlinked} {unlinked === 1 ? 'kaart telt' : 'kaarten tellen'} niet mee omdat ze nog niet gekoppeld zijn.
        </p>
      )}
      {sorted.length === 0 && <p className="empty">Nog geen gekoppelde kaarten in bezit.</p>}

      <ul className="set-list">
        {sorted.map((r) => {
          const total = r.summary?.total ?? 0
          const ratio = total ? Math.min(1, r.owned.size / total) : 0
          return (
            <li key={`${r.lang}/${r.setId}`}>
              <a className="set-row" href={`#/sets/${r.lang}/${encodeURIComponent(r.setId)}`}>
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
                  <span className="set-name">{r.summary?.name ?? r.setId}</span>
                  <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={r.owned.size} aria-label={`${r.summary?.name ?? r.setId}: ${r.owned.size} van ${total || '?'}`}>
                    <span className="meter-fill" style={{ width: `${ratio * 100}%` }} />
                  </span>
                </span>
                <span className="set-count">
                  <strong>{r.owned.size}</strong>/{total || '?'}
                  {total > 0 && <span className="muted small"> {pct.format(ratio)}</span>}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
