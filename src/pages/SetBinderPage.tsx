import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { listCards } from '../lib/db'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { CardPicture } from '../components/CardPicture'
import { getCardPrice, getSet, imageCandidates, isLang, setOfKey, type SetCard, type SetSummary } from '../lib/tcgdex'

interface Props {
  /** "<taal>/<set-id>" uit de URL. */
  param: string
}

type Show = 'all' | 'owned' | 'missing'
type PageSize = 9 | 12

interface Loaded {
  summary: SetSummary
  cards: SetCard[]
  /** kaart-id → aantal in bezit */
  owned: Map<string, number>
}

interface Cost {
  done: number
  total: number
  /** kaart-id → marktprijs (null = onbekend) */
  prices: Map<string, number | null>
  running: boolean
}

const PAGE_SIZE_KEY = 'binderline:binder-page-size'

function readPageSize(): PageSize {
  try {
    return localStorage.getItem(PAGE_SIZE_KEY) === '12' ? 12 : 9
  } catch {
    return 9 // geen opslag: standaard 9-pocket
  }
}

export function SetBinderPage({ param }: Props): JSX.Element {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('all')
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize)
  const [cost, setCost] = useState<Cost | null>(null)
  const cancelCost = useRef(false)

  const slash = param.indexOf('/')
  const lang = param.slice(0, slash)
  const setId = decodeURIComponent(param.slice(slash + 1))
  const valid = slash > 0 && isLang(lang) && setId.length > 0

  useEffect(() => {
    if (!valid || !isLang(lang)) return
    let cancelled = false
    // Binder blijft bekijkbaar als je collectie (even) niet laadt; dan staat alles als "missing".
    const myCards = listCards().catch((err: unknown) => {
      console.warn('Collectie laden mislukt', err)
      return []
    })
    Promise.all([getSet(lang, setId), myCards])
      .then(([set, cards]) => {
        if (cancelled) return
        if (!set) {
          setError('This set was not found.')
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading failed.')
      })
    return () => {
      cancelled = true
    }
  }, [valid, lang, setId])

  // Lopende kostenberekening stoppen bij verlaten van de pagina.
  useEffect(
    () => () => {
      cancelCost.current = true
    },
    [],
  )

  function changePageSize(size: PageSize): void {
    setPageSize(size)
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size))
    } catch (err) {
      console.warn('Paginaformaat onthouden mislukt', err)
    }
  }

  async function calculateCost(): Promise<void> {
    if (!data || !isLang(lang) || cost?.running) return
    const missing = data.cards.filter((c) => !data.owned.has(c.id))
    cancelCost.current = false
    const prices = new Map<string, number | null>()
    setCost({ done: 0, total: missing.length, prices, running: true })
    let done = 0
    // Prijzen komen via de centrale TCGdex-wachtrij (max. 6 tegelijk) en worden 6 uur gecachet.
    await Promise.all(
      missing.map(async (c) => {
        let value: number | null = null
        try {
          value = marketValue(await getCardPrice(`${lang}/${c.id}`), null)?.value ?? null
        } catch (err) {
          console.error(`Prijs ophalen mislukt voor ${c.id}`, err)
        }
        if (cancelCost.current) return
        prices.set(c.id, value)
        done += 1
        if (done % 5 === 0 || done === missing.length) setCost({ done, total: missing.length, prices: new Map(prices), running: done < missing.length })
      }),
    )
  }

  const visible = useMemo(() => {
    if (!data) return []
    if (show === 'owned') return data.cards.filter((c) => data.owned.has(c.id))
    if (show === 'missing') return data.cards.filter((c) => !data.owned.has(c.id))
    return data.cards
  }, [data, show])

  const pages = useMemo(() => {
    const out: SetCard[][] = []
    for (let i = 0; i < visible.length; i += pageSize) out.push(visible.slice(i, i + pageSize))
    return out
  }, [visible, pageSize])

  const costSummary = useMemo(() => {
    if (!cost) return null
    let cents = 0
    let unknown = 0
    for (const v of cost.prices.values()) {
      if (v === null) unknown += 1
      else cents += Math.round(v * 100)
    }
    return { amount: cents / 100, unknown }
  }, [cost])

  if (!valid) return <p className="page error">Invalid set. <a href="#/sets">Back to sets</a></p>
  if (error) return <p className="page error" role="alert">{error} <a href="#/sets">Back to sets</a></p>
  if (!data) return <p className="center" aria-live="polite">Laden…</p>

  const ownedCount = data.owned.size
  const total = data.summary.total ?? data.cards.length
  const missingCount = data.cards.length - ownedCount

  return (
    <section className="page">
      <a href="#/sets" className="back">
        ← All sets
      </a>
      <div className="page-head">
        <div>
          <h1>{data.summary.name}</h1>
          <p className="muted">
            {ownedCount} of {total} cards
            {data.summary.releaseDate && `, released ${data.summary.releaseDate.slice(0, 4)}`}
          </p>
        </div>
      </div>

      {missingCount > 0 && data.cards.length > 0 && (
        <div className="panel cost-panel">
          <div>
            <span className="stat-label">Cost to complete</span>
            {costSummary && cost ? (
              <>
                <p className="meter-value">
                  {cost.running ? `${formatEur(costSummary.amount)}…` : formatEur(costSummary.amount)}
                </p>
                <p className="muted small">
                  {cost.running
                    ? `Fetching prices: ${cost.done} of ${cost.total}`
                    : `${missingCount} missing cards${costSummary.unknown > 0 ? `, ${costSummary.unknown} without price` : ''}`}
                </p>
              </>
            ) : (
              <p className="muted small">
                Total market price of your {missingCount} missing cards.
              </p>
            )}
          </div>
          {!cost?.running && (
            <button type="button" className="primary" onClick={() => void calculateCost()}>
              {cost ? 'Recalculate' : 'Calculate'}
            </button>
          )}
        </div>
      )}

      <div className="filters">
        <div className="segmented" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['owned', 'Owned'],
              ['missing', 'Missing'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={show === key} onClick={() => setShow(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Pockets per page">
          {([9, 12] as const).map((size) => (
            <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => changePageSize(size)}>
              {size === 9 ? '9 per page' : '12 per page'}
            </button>
          ))}
        </div>
      </div>

      {data.cards.length === 0 && (
        <p className="notice">No card list is available for this set.</p>
      )}

      <div className="binder-pages">
        {pages.map((page, i) => (
          <section key={i} className="binder-page" aria-label={`Page ${i + 1}`}>
            <p className="binder-page-label">Page {i + 1}</p>
            <ul className="binder set-binder" style={{ ['--binder-cols' as string]: pageSize === 9 ? 3 : 4 }}>
              {page.map((c) => {
                const qty = data.owned.get(c.id)
                const price = cost?.prices.get(c.id)
                return (
                  <li key={c.id} className={`slot${qty ? ' have' : ' missing'}`}>
                    <CardPicture
                      sources={isLang(lang) ? imageCandidates(lang, data.summary.id, c.localId, c.image, 'low') : []}
                      alt={`${c.name} ${c.localId}${qty ? '' : ' (missing)'}`}
                      fallback={
                        <div className="card-img placeholder" role="img" aria-label={`${c.name} ${c.localId}`}>
                          <span>{c.name}</span>
                        </div>
                      }
                    />
                    <span className="slot-num">{c.localId}</span>
                    {!qty && price !== undefined && (
                      <span className="slot-price">{price === null ? 'no price' : formatEur(price)}</span>
                    )}
                    {qty && qty > 1 && <span className="qty-badge">{qty}×</span>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
