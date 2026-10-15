import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { listCards } from '../lib/db'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, getSet, imageUrl, isLang, setOfKey, type SetCard, type SetSummary } from '../lib/tcgdex'

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

const PAGE_SIZE_KEY = 'kaartenmap:binder-page-size'

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

  if (!valid) return <p className="page error">Ongeldige set. <a href="#/sets">Terug naar sets</a></p>
  if (error) return <p className="page error" role="alert">{error} <a href="#/sets">Terug naar sets</a></p>
  if (!data) return <p className="center" aria-live="polite">Laden…</p>

  const ownedCount = data.owned.size
  const total = data.summary.total ?? data.cards.length
  const missingCount = data.cards.length - ownedCount

  return (
    <section className="page">
      <a href="#/sets" className="back">
        ← Alle sets
      </a>
      <div className="page-head">
        <div>
          <h1>{data.summary.name}</h1>
          <p className="muted">
            {ownedCount} van {total} kaarten in bezit
            {data.summary.releaseDate && `, uitgebracht ${data.summary.releaseDate}`}
          </p>
        </div>
      </div>

      {missingCount > 0 && data.cards.length > 0 && (
        <div className="panel cost-panel">
          <div>
            <span className="stat-label">Kosten om af te maken</span>
            {costSummary && cost ? (
              <>
                <p className="meter-value">
                  {cost.running ? `${formatEur(costSummary.amount)}…` : formatEur(costSummary.amount)}
                </p>
                <p className="muted small">
                  {cost.running
                    ? `Prijzen ophalen: ${cost.done} van ${cost.total}`
                    : `${missingCount} ontbrekende kaarten tegen Cardmarket-trendprijs${costSummary.unknown > 0 ? `; ${costSummary.unknown} zonder prijs (niet meegeteld)` : ''}.`}
                </p>
              </>
            ) : (
              <p className="muted small">
                Telt de marktprijzen van je {missingCount} ontbrekende kaarten op. Haalt veel prijzen op, dus duurt even.
              </p>
            )}
          </div>
          {!cost?.running && (
            <button type="button" className="primary" onClick={() => void calculateCost()}>
              {cost ? 'Opnieuw berekenen' : 'Bereken'}
            </button>
          )}
        </div>
      )}

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
        <div className="segmented" role="group" aria-label="Vakken per pagina">
          {([9, 12] as const).map((size) => (
            <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => changePageSize(size)}>
              {size === 9 ? '9 per pagina' : '12 per pagina'}
            </button>
          ))}
        </div>
      </div>

      {data.cards.length === 0 && (
        <p className="notice">De kaartdatabase heeft geen kaartenlijst voor deze set, dus de binder kan niet getoond worden.</p>
      )}

      <div className="binder-pages">
        {pages.map((page, i) => (
          <section key={i} className="binder-page" aria-label={`Pagina ${i + 1}`}>
            <p className="binder-page-label">Pagina {i + 1}</p>
            <ul className="binder set-binder" style={{ ['--binder-cols' as string]: pageSize === 9 ? 3 : 4 }}>
              {page.map((c) => {
                const qty = data.owned.get(c.id)
                const src = imageUrl(c.image, 'low')
                const price = cost?.prices.get(c.id)
                return (
                  <li key={c.id} className={`slot${qty ? ' have' : ' missing'}`}>
                    {src ? (
                      <img
                        className="card-img"
                        src={src}
                        alt={`${c.name} ${c.localId}${qty ? '' : ' (ontbreekt)'}`}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="card-img placeholder" role="img" aria-label={`${c.name} ${c.localId}`}>
                        <span>{c.name}</span>
                      </div>
                    )}
                    <span className="slot-num">{c.localId}</span>
                    {!qty && price !== undefined && (
                      <span className="slot-price">{price === null ? 'geen prijs' : formatEur(price)}</span>
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
