import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useCardPrices } from '../hooks/useCardPrices'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { rarityRule } from '../lib/cardTraits'
import { HIT_ORDER_LABELS, catalogActive, needsHitPrices, needsHitRarity, searchCatalog, sortHits, type CatalogHit, type HitOrder } from '../lib/catalogSearch'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
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
  /** Aangeklikte kaart: de hele (gesorteerde) lijst en de positie erin, om door te kunnen bladeren. */
  onPick: (hits: readonly CatalogHit[], index: number, lang: Lang) => void
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
const formatPrice = (v: number | null): string => (v === null ? 'No price' : `Market ${formatEur(v)}`)
/** Zoveel pixels vóór het einde van de lijst al de volgende kaarten laden. */
const LOAD_AHEAD = '800px'
const DEBOUNCE_MS = 400

type State = { key: string; hits: CatalogHit[] | null; error: string | null }

/** Kaarten uit de kaartendatabase (TCGdex) voor de zoekterm, om aan de wishlist toe te voegen. */
const NO_FILTERS: CardQueryFilters = {}
const HIT_ORDERS = Object.keys(HIT_ORDER_LABELS) as HitOrder[]

export function CatalogResults({ query, lang, wished, owned, onPick, note = null, onlySets = null, filters = NO_FILTERS, setId = '' }: Props): JSX.Element | null {
  const term = query.trim()
  const active = catalogActive(query, filters, setId)
  const { rarity = '', type = '', suffix = '' } = filters
  const key = `${lang}|${term.toLowerCase()}|${onlySets ? [...onlySets].join(',') : ''}|${rarity}|${type}|${suffix}|${setId}`
  const [state, setState] = useState<State>({ key: '', hits: null, error: null })
  const [shown, setShown] = useState({ key: '', count: PAGE })
  const [order, setOrder] = useStoredChoice<HitOrder>('dexcrate:catalog-sort', HIT_ORDERS, 'newest')

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
  // Prijs of zeldzaamheid alleen ophalen als je daarop sorteert (prijzen 6 uur, kaartinfo 7 dagen bewaard).
  const hitKeys = useMemo(() => (currentHits ?? []).map((h) => `${lang}/${h.card.id}`), [currentHits, lang])
  const prices = useCardPrices(hitKeys, needsHitPrices(order))
  const infos = useCatalogInfos(hitKeys, needsHitRarity(order))
  const sortData = useMemo(() => {
    const price = new Map<string, number | null>()
    for (const [k, p] of prices) price.set(k.slice(k.indexOf('/') + 1), marketValue(p, null)?.value ?? null)
    const rank = new Map<string, number>()
    for (const [k, info] of infos) if (info?.rarity) rank.set(k.slice(k.indexOf('/') + 1), rarityRule(info.rarity).rank)
    return { price, rank }
  }, [prices, infos])
  const hits = useMemo(() => (currentHits ? sortHits(currentHits, order, sortData) : null), [currentHits, order, sortData])
  const count = shown.key === key ? shown.count : PAGE
  const total = hits?.length ?? 0

  // Vanzelf meer laden zodra het einde van de lijst in beeld komt.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || total <= count) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown({ key, count: count + PAGE })
      },
      { rootMargin: LOAD_AHEAD },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [key, count, total])

  if (!active) return null
  const loading = needsHitPrices(order) ? { what: 'prices', done: prices.size } : needsHitRarity(order) ? { what: 'rarities', done: infos.size } : null

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
          <select className="catalog-sort" aria-label="Sort cards" value={order} onChange={(e) => setOrder(e.target.value as HitOrder)}>
            {(Object.keys(HIT_ORDER_LABELS) as HitOrder[]).map((o) => (
              <option key={o} value={o}>
                {HIT_ORDER_LABELS[o]}
              </option>
            ))}
          </select>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      {hits && loading && loading.done < hits.length && (
        <p className="muted small" aria-live="polite">
          Loading {loading.what}… {loading.done} of {hits.length}
        </p>
      )}
      {!current && <Loading text="Searching…" />}
      {current?.error && (
        <p className="error" role="alert">
          {current.error}
        </p>
      )}
      {hits && hits.length > 0 && (
        <>
          <ul className="catalog-grid">
            {hits.slice(0, count).map((hit, index) => {
              const k = `${lang}/${hit.card.id}`
              const status = wished.has(k) ? 'On your wishlist' : owned.has(k) ? 'Owned' : null
              return (
                <li key={k}>
                  <button type="button" className="catalog-hit" onClick={() => onPick(hits, index, lang)}>
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
                    {needsHitPrices(order) && sortData.price.has(hit.card.id) && (
                      <span className="small">{formatPrice(sortData.price.get(hit.card.id) ?? null)}</span>
                    )}
                    {status && <span className={`chip${status === 'Owned' ? ' status-sold' : ''}`}>{status}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {hits.length > count && (
            <div ref={sentinel} className="catalog-more">
              <Loading text={`Loading more cards… (${hits.length - count} left)`} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
