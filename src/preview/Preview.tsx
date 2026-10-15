/**
 * Ontwerppreview (alleen dev, http://localhost:5173/preview.html?theme=dark&page=collectie).
 * Echte componenten met verzonnen voorbeelddata, zodat het uiterlijk zonder inloggen te bekijken is.
 */
import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardTile } from '../components/CardTile'
import { Shell } from '../components/Shell'
import { DashboardView } from '../components/DashboardView'
import { ScanPage } from '../pages/ScanPage'
import type { MarketValue, PriceMap } from '../lib/prices'
import { getSet, imageUrl, type CardmarketPrice, type SetCard } from '../lib/tcgdex'
import type { Route } from '../lib/routes'
import { EMPTY_CARD, type Card, type CardInput } from '../lib/types'

const params = new URLSearchParams(location.search)
const theme = params.get('theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme

let n = 0
function demo(patch: Partial<CardInput>): Card {
  n += 1
  return {
    ...EMPTY_CARD,
    name: 'Demo',
    ...patch,
    id: `demo-${n}`,
    user_id: 'demo',
    created_at: '',
    updated_at: '',
  }
}

const CARDS: { card: Card; market: MarketValue | null }[] = [
  { card: demo({ name: 'Mew ex', set_code: 'MEW', card_number: '151', tcgdex_id: 'en/sv03.5-151', purchase_price: 6.5, variant: 'holo', condition: 'NM' }), market: { value: 7.34, basis: 'trend', reverse: false, change30: 0.06 } },
  { card: demo({ name: 'Charizard ex', set_code: 'MEW', card_number: '6', tcgdex_id: 'en/sv03.5-006', status: 'for_sale', sale_price: 8.35 }), market: { value: 7.9, basis: 'trend', reverse: false, change30: -0.04 } },
  { card: demo({ name: 'Oranguru V', set_code: 'ASR', card_number: '133', tcgdex_id: 'en/swsh10-133', purchase_price: 0.75 }), market: { value: 0.77, basis: 'trend', reverse: false, change30: 0 } },
  { card: demo({ name: 'Mega Charizard X ex', set_code: 'PFL', card_number: '13', tcgdex_id: 'en/me02-013', status: 'sold', sale_price: 24 }), market: { value: 22.1, basis: 'trend', reverse: false, change30: 0.12 } },
  { card: demo({ name: 'Vivillon', set_code: 'SV8', card_number: '107', tcgdex_id: 'ja/SV8-107', language: 'ja', quantity: 3, purchase_price: 1.5 }), market: { value: 1.28, basis: 'trend', reverse: false, change30: -0.09 } },
  { card: demo({ name: 'Arbok', set_code: 'TEF', card_number: '176', tcgdex_id: 'en/sv05-176', grading_company: 'PSA', grade: 10, purchase_price: 40 }), market: { value: 3.1, basis: 'trend', reverse: false, change30: 0.02 } },
  { card: demo({ name: 'Chaos Rising Booster Box', kind: 'sealed', purchase_price: 201.9 }), market: null },
  { card: demo({ name: 'Morpeko', set_code: 'CBB3C', card_number: '14', language: 'zh-cn', purchase_price: 3.5 }), market: null },
]

/** Nep-Cardmarketprijzen afgeleid uit de voorbeeldwaarden. */
const PRICES: PriceMap = new Map(
  CARDS.flatMap(({ card, market }): [string, CardmarketPrice][] =>
    card.tcgdex_id && market
      ? [
          [
            card.tcgdex_id,
            {
              idProduct: null,
              updated: null,
              trend: market.value,
              low: null,
              avg1: null,
              avg7: null,
              avg30: market.change30 === null ? null : market.value / (1 + market.change30),
              trendHolo: null,
              lowHolo: null,
              avg1Holo: null,
              avg7Holo: null,
              avg30Holo: null,
            },
          ],
        ]
      : [],
  ),
)

/** 30 dagen fictief waardeverloop. */
const SERIES = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  value: 160 + Math.round((Math.sin(i / 4) * 8 + i * 0.6) * 100) / 100,
}))

/** Binder-uiterlijk met een echte set (151) en verzonnen bezit. */
function BinderPreview(): JSX.Element {
  const [cards, setCards] = useState<SetCard[]>([])
  const cols = params.get('cols') === '4' ? 4 : 3
  const size = cols * 3
  useEffect(() => {
    getSet('en', 'sv03.5')
      .then((s) => setCards(s?.cards.slice(0, size * 2) ?? []))
      .catch((err: unknown) => console.error(err))
  }, [size])
  const pages = [cards.slice(0, size), cards.slice(size, size * 2)]
  return (
    <section className="page">
      <a href="#/sets" className="back">← All sets</a>
      <div className="page-head">
        <div>
          <h1>151</h1>
          <p className="muted">11 of 207 cards, released 2023</p>
        </div>
      </div>
      <div className="panel cost-panel">
        <div>
          <span className="stat-label">Cost to complete</span>
          <p className="meter-value">€1,284.55</p>
          <p className="muted small">196 missing cards, 3 without price</p>
        </div>
        <button type="button" className="primary">Recalculate</button>
      </div>
      <div className="binder-pages">
        {pages.map((page, i) => (
          <section key={i} className="binder-page">
            <p className="binder-page-label">Page {i + 1}</p>
            <ul className="binder set-binder" style={{ ['--binder-cols' as string]: cols }}>
              {page.map((c, j) => {
                const have = (i * size + j) % 3 === 0
                return (
                  <li key={c.id} className={`slot${have ? ' have' : ' missing'}`}>
                    <img className="card-img" src={imageUrl(c.image, 'low') ?? ''} alt="" />
                    <span className="slot-num">{c.localId}</span>
                    {!have && <span className="slot-price">€{(j * 0.37 + 0.1).toFixed(2)}</span>}
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

export function Preview(): JSX.Element {
  const page = (params.get('page') ?? 'collection') as Route
  const noop = useMemo(() => () => undefined, [])
  if (page === 'scan') {
    return (
      <Shell route={page} email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <ScanPage />
      </Shell>
    )
  }
  if (page === 'sets') {
    return (
      <Shell route={page} email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <BinderPreview />
      </Shell>
    )
  }
  if (page === 'overview') {
    return (
      <Shell route={page} email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <DashboardView cards={CARDS.map((c) => c.card)} prices={PRICES} pricesLoading={false} series={SERIES} />
      </Shell>
    )
  }
  return (
    <Shell route={page} email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
      <section className="page">
        <div className="page-head">
          <div>
            <h1>Collection</h1>
            <p className="muted">12 cards, market value €61.73</p>
          </div>
          <button type="button" className="primary">Add card</button>
        </div>
        <div className="filters">
          <div className="search">
            <input type="search" placeholder="Search name, set or number" aria-label="Search" />
          </div>
          <div className="segmented" role="group" aria-label="Status">
            <button type="button" aria-pressed="true">Owned <span className="count">10</span></button>
            <button type="button" aria-pressed="false">In collection <span className="count">8</span></button>
            <button type="button" aria-pressed="false">For sale <span className="count">2</span></button>
            <button type="button" aria-pressed="false">Sold <span className="count">1</span></button>
          </div>
          <select aria-label="Sort">
            <option>Date added</option>
          </select>
        </div>
        <ul className="binder">
          {CARDS.map(({ card, market }) => (
            <CardTile key={card.id} card={card} market={market} onOpen={noop} onToggleSold={noop} />
          ))}
        </ul>
      </section>
    </Shell>
  )
}

