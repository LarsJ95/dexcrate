import { useEffect, useMemo, useState, type JSX } from 'react'
import { catalogActive, searchCatalog, sortHits, type CatalogHit, type HitOrder } from '../lib/catalogSearch'
import type { CardQueryFilters, Lang } from '../lib/tcgdex'
import { CardFace } from './CardFace'
import { CatalogCardPicture } from './CatalogCardPicture'
import { Loading } from './Loading'
import { SetIcon } from './SetIcon'

interface Props {
  query: string
  lang: Lang
  /** Catalogussleutels ("<taal>/<kaart-id>") die al op de wishlist staan. */
  wished: ReadonlySet<string>
  /** Catalogussleutels die je al hebt. */
  owned: ReadonlySet<string>
  onPick: (hit: CatalogHit, lang: Lang) => void
  /** Uitleg onder de kop, bv. dat een Europese taal de Engelse kaarten toont. */
  note?: string | null
  /** Alleen kaarten uit deze sets tonen (bv. de paar sets die in het Nederlands bestaan). */
  onlySets?: ReadonlySet<string> | null
  /** Zeldzaamheid, type en kaarttype; met een filter kun je ook zonder zoekterm bladeren. */
  filters?: CardQueryFilters
  /** Alleen deze set ("sv03.5"); zonder zoekterm toont hij de hele set. */
  setId?: string
}

const PAGE = 24
const DEBOUNCE_MS = 400

type State = { key: string; hits: CatalogHit[] | null; error: string | null }

/** Kaarten uit de kaartendatabase (TCGdex) voor de zoekterm, om aan de wishlist toe te voegen. */
const NO_FILTERS: CardQueryFilters = {}

export function CatalogResults({ query, lang, wished, owned, onPick, note = null, onlySets = null, filters = NO_FILTERS, setId = '' }: Props): JSX.Element | null {
  const term = query.trim()
  const active = catalogActive(query, filters, setId)
  const { rarity = '', type = '', suffix = '' } = filters
  const key = `${lang}|${term.toLowerCase()}|${onlySets ? [...onlySets].join(',') : ''}|${rarity}|${type}|${suffix}|${setId}`
  const [state, setState] = useState<State>({ key: '', hits: null, error: null })
  const [shown, setShown] = useState({ key: '', count: PAGE })
  const [order, setOrder] = useState<HitOrder>('newest')

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const t = window.setTimeout(() => {
      searchCatalog(term, lang, { rarity, type, suffix }, setId)
        .then((hits) => {
          if (!cancelled) setState({ key, hits: onlySets ? hits.filter((h) => onlySets.has(h.setId)) : hits, error: null })
        })
        .catch((err: unknown) => {
          console.error('Zoeken in de kaartendatabase mislukt', err)
          if (!cancelled) setState({ key, hits: null, error: 'Searching the card database failed. Check your connection and try again.' })
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [active, term, lang, key, onlySets, rarity, type, suffix, setId])

  const current = state.key === key ? state : null
  const currentHits = current?.hits ?? null
  const hits = useMemo(() => (currentHits ? sortHits(currentHits, order) : null), [currentHits, order])
  if (!active) return null
  const count = shown.key === key ? shown.count : PAGE

  return (
    <section className="catalog-results" aria-labelledby="catalog-title">
      <div className="catalog-head">
        <h2 id="catalog-title" className="section-title">
          Card database
        </h2>
        {hits && (
          <span className="muted small">{hits.length === 0 ? 'No cards found' : `${hits.length} ${hits.length === 1 ? 'card' : 'cards'}`}</span>
        )}
        {hits && hits.length > 1 && (
          <select className="catalog-sort" aria-label="Sort cards" value={order} onChange={(e) => setOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}>
            <option value="newest">Newest sets first</option>
            <option value="oldest">Oldest sets first</option>
          </select>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      {!current && <Loading text="Searching…" />}
      {current?.error && (
        <p className="error" role="alert">
          {current.error}
        </p>
      )}
      {hits && hits.length > 0 && (
        <>
          <ul className="catalog-grid">
            {hits.slice(0, count).map((hit) => {
              const k = `${lang}/${hit.card.id}`
              const status = wished.has(k) ? 'On your wishlist' : owned.has(k) ? 'Owned' : null
              return (
                <li key={k}>
                  <button type="button" className="catalog-hit" onClick={() => onPick(hit, lang)}>
                    <CatalogCardPicture
                      lang={lang}
                      setId={hit.setId}
                      localId={hit.card.localId}
                      image={hit.card.image}
                      name={hit.card.name}
                      quality="low"
                      alt=""
                      fallback={<CardFace name={hit.card.name} detail={`#${hit.card.localId}`} />}
                    />
                    <span className="catalog-name">{hit.card.name}</span>
                    <span className="muted small">
                      <SetIcon kind="symbol" lang={lang} setId={hit.setId} name={hit.set?.name ?? ''} logo={hit.set?.logo ?? null} />
                      {hit.set?.name ?? hit.setId} #{hit.card.localId}
                    </span>
                    {status && <span className={`chip${status === 'Owned' ? ' status-sold' : ''}`}>{status}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {hits.length > count && (
            <button type="button" className="small-btn" onClick={() => setShown({ key, count: count + PAGE })}>
              Show more ({hits.length - count} left)
            </button>
          )}
        </>
      )}
    </section>
  )
}
