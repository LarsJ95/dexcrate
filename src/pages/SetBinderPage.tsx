import { useEffect, useMemo, useState, type JSX } from 'react'
import { listCards } from '../lib/db'
import { getSet, imageUrl, isLang, setOfKey, type SetCard, type SetSummary } from '../lib/tcgdex'

interface Props {
  /** "<taal>/<set-id>" uit de URL. */
  param: string
}

type Show = 'all' | 'owned' | 'missing'

interface Loaded {
  summary: SetSummary
  cards: SetCard[]
  /** kaart-id → aantal in bezit */
  owned: Map<string, number>
}

export function SetBinderPage({ param }: Props): JSX.Element {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('all')

  const slash = param.indexOf('/')
  const lang = param.slice(0, slash)
  const setId = decodeURIComponent(param.slice(slash + 1))
  const valid = slash > 0 && isLang(lang) && setId.length > 0

  useEffect(() => {
    if (!valid || !isLang(lang)) return
    let cancelled = false
    Promise.all([getSet(lang, setId), listCards()])
      .then(([set, cards]) => {
        if (cancelled) return
        if (!set) {
          setError('Deze set is niet gevonden in de kaartdatabase.')
          return
        }
        const owned = new Map<string, number>()
        for (const c of cards) {
          if (c.status === 'sold' || !c.tcgdex_id) continue
          const s = setOfKey(c.tcgdex_id)
          if (s && s.lang === lang && s.setId === set.summary.id) owned.set(s.cardId, (owned.get(s.cardId) ?? 0) + c.quantity)
        }
        setData({ summary: set.summary, cards: set.cards, owned })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [valid, lang, setId])

  const visible = useMemo(() => {
    if (!data) return []
    if (show === 'owned') return data.cards.filter((c) => data.owned.has(c.id))
    if (show === 'missing') return data.cards.filter((c) => !data.owned.has(c.id))
    return data.cards
  }, [data, show])

  if (!valid) return <p className="page error">Ongeldige set. <a href="#/sets">Terug naar sets</a></p>
  if (error) return <p className="page error" role="alert">{error} <a href="#/sets">Terug naar sets</a></p>
  if (!data) return <p className="center" aria-live="polite">Laden…</p>

  const ownedCount = data.owned.size
  const total = data.summary.total ?? data.cards.length

  return (
    <section className="page">
      <a href="#/sets" className="back">Alle sets</a>
      <div className="page-head">
        <div>
          <h1>{data.summary.name}</h1>
          <p className="muted">
            {ownedCount} van {total} kaarten in bezit
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Tonen">
          {(
            [
              ['all', 'Alle kaarten'],
              ['owned', 'Heb ik'],
              ['missing', 'Mis ik'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={show === key} onClick={() => setShow(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.cards.length === 0 && (
        <p className="notice">De kaartdatabase heeft geen kaartenlijst voor deze set, dus de binder kan niet getoond worden.</p>
      )}

      <ul className="binder set-binder">
        {visible.map((c) => {
          const qty = data.owned.get(c.id)
          const src = imageUrl(c.image, 'low')
          return (
            <li key={c.id} className={`slot${qty ? ' have' : ' missing'}`}>
              {src ? (
                <img className="card-img" src={src} alt={`${c.name} ${c.localId}${qty ? '' : ' (ontbreekt)'}`} loading="lazy" decoding="async" />
              ) : (
                <div className="card-img placeholder" role="img" aria-label={`${c.name} ${c.localId}`}>
                  <span>{c.name}</span>
                </div>
              )}
              <span className="slot-num">{c.localId}</span>
              {qty && qty > 1 && <span className="qty-badge">{qty}×</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
