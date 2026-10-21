/**
 * Ontwerppreview (alleen dev, http://localhost:5173/preview.html?theme=dark&page=collectie).
 * Echte componenten met verzonnen voorbeelddata, zodat het uiterlijk zonder inloggen te bekijken is.
 */
import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardTile } from '../components/CardTile'
import { Shell } from '../components/Shell'
import { seedSkyForPreview } from '../lib/sky'
import { CameraCapture } from '../components/CameraCapture'
import { CardDialog } from '../components/CardDialog'
import { CardImage } from '../components/CardImage'
import { CardZoom } from '../components/CardZoom'
import { SetCardSheet } from '../components/SetCardSheet'
import { DashboardView } from '../components/DashboardView'
import { ValueBreakdown } from '../components/ValueBreakdown'
import { WishDeals } from '../components/WishDeals'
import { IconArrowLeft, IconSearch } from '../components/Icons'
import { BackupPage } from '../pages/BackupPage'
import { CollectionPage } from '../pages/CollectionPage'
import { ImportPage } from '../pages/ImportPage'
import { MorePage } from '../pages/MorePage'
import { SettingsPage } from '../pages/SettingsPage'
import { AdminPage } from '../pages/AdminPage'
import { TransactionsPage } from '../pages/TransactionsPage'
import { WishlistPage } from '../pages/WishlistPage'
import { CratePage } from '../pages/CratePage'
import { ScanPage } from '../pages/ScanPage'
import { SetBinderPage } from '../pages/SetBinderPage'
import { SetsPage } from '../pages/SetsPage'
import { overrideSchemaV2ForPreview } from '../lib/db'
import { showMoment } from '../lib/moments'
import { seedPeekForPreview } from '../lib/sprites'
import { overrideTransactionsForPreview } from '../lib/transactions'
import { overrideGoalForPreview } from '../lib/wishlist'
import { overrideValuationsForPreview } from '../lib/valuationDb'
import type { Transaction } from '../lib/transactionTypes'
import { PurchaseDialog } from '../components/PurchaseDialog'
import { SaleDialog } from '../components/SaleDialog'
import { TransactionDialog } from '../components/TransactionDialog'
import type { MarketValue, PriceMap } from '../lib/prices'
import { getSet, type CardmarketPrice, type SetCard } from '../lib/tcgdex'
import { imageUrl } from '../lib/cardImages'
import type { Route } from '../lib/routes'
import { EMPTY_CARD, fromStatus, type Card, type CardInput } from '../lib/types'

const params = new URLSearchParams(location.search)
const theme = params.get('theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme

// ?v2=1: doen alsof STAP4 gedraaid is (nieuwe velden en foto's zichtbaar).
const previewV2 = params.get('v2') === '1'
if (previewV2) overrideSchemaV2ForPreview(true)
// ?goal=variants: doen alsof STAP6 gedraaid is, met een doel per uitvoering (normaal + reverse + holo).
if (params.get('goal') === 'variants') {
  overrideGoalForPreview({ variants: ['normal', 'reverse', 'holo'], languages: [], includeSecret: false, includeIncoming: false, wantedQty: 1 })
}
// ?v4=1: doen alsof STAP7 (waarderingen) gedraaid is.
if (params.get('v4') === '1') overrideValuationsForPreview(true)
// ?v3=1: doen alsof STAP5 (transacties) gedraaid is.
if (params.get('v3') === '1') overrideTransactionsForPreview(true)

let n = 0
function demo(patch: Partial<CardInput>): Card {
  n += 1
  return {
    ...EMPTY_CARD,
    name: 'Demo',
    ...(patch.status ? fromStatus(patch.status) : {}),
    ...patch,
    id: `demo-${n}`,
    user_id: 'demo',
    created_at: '',
    updated_at: '',
    photos: [],
    split_from: null,
  }
}

const CARDS: { card: Card; market: MarketValue | null }[] = [
  {
    card: {
      ...demo({ name: 'Mew ex', set_code: 'MEW', card_number: '151', tcgdex_id: 'en/sv03.5-151', purchase_price: 6.5, variant: 'holo', condition: 'NM', notes: previewV2 ? 'Bought at the Utrecht card fair.' : null }),
      photos: previewV2
        ? [
            { id: 'ph1', card_id: 'demo-1', path: 'demo/1.jpg', thumb_path: 'demo/1-thumb.jpg', label: 'front', is_primary: true, created_at: '2026-10-01' },
            { id: 'ph2', card_id: 'demo-1', path: 'demo/2.jpg', thumb_path: 'demo/2-thumb.jpg', label: 'back', is_primary: false, created_at: '2026-10-02' },
          ]
        : [],
    }, market: { value: 7.34, basis: 'trend', reverse: false, change30: 0.06 } },
  { card: demo({ name: 'Charizard ex', set_code: 'MEW', card_number: '6', tcgdex_id: 'en/sv03.5-006', status: 'for_sale', sale_price: 8.35, variant: 'reverse' }), market: { value: 7.9, basis: 'trend', reverse: false, change30: -0.04 } },
  { card: demo({ name: 'Oranguru V', set_code: 'ASR', card_number: '133', tcgdex_id: 'en/swsh10-133', purchase_price: 0.75 }), market: { value: 0.77, basis: 'trend', reverse: false, change30: 0 } },
  { card: demo({ name: 'Mega Charizard X ex', set_code: 'PFL', card_number: '13', tcgdex_id: 'en/me02-013', status: 'sold', sale_price: 24 }), market: { value: 22.1, basis: 'trend', reverse: false, change30: 0.12 } },
  { card: demo({ name: 'Vivillon', set_code: 'SV8', card_number: '107', tcgdex_id: 'ja/SV8-107', language: 'ja', quantity: 3, purchase_price: 1.5 }), market: { value: 1.28, basis: 'trend', reverse: false, change30: -0.09 } },
  { card: demo({ name: 'Arbok', set_code: 'TEF', card_number: '176', tcgdex_id: 'en/sv05-176', grading_company: 'PSA', grade: 10, purchase_price: 40 }), market: { value: 3.1, basis: 'trend', reverse: false, change30: 0.02 } },
  { card: demo({ name: 'Chaos Rising Booster Box', kind: 'sealed', purchase_price: 201.9 }), market: null },
  { card: demo({ name: 'Morpeko', set_code: 'CBB3C', card_number: '14', language: 'zh-cn', purchase_price: 3.5 }), market: null },
]

// ?sky=star|flyer|gengar[&phase=dawn|day|dusk|night]: achtergrond-gebeurtenis direct starten.
const skyKind = params.get('sky')
const skyPhaseParam = params.get('phase')
const seededKind = skyKind === 'star' || skyKind === 'flyer' || skyKind === 'gengar' ? skyKind : null
const seededPhase = skyPhaseParam === 'dawn' || skyPhaseParam === 'day' || skyPhaseParam === 'dusk' || skyPhaseParam === 'night' ? skyPhaseParam : null
if (seededKind || seededPhase) seedSkyForPreview(seededKind, seededPhase)

// ?peek=<ms>: Pikachu kijkt na zoveel ms om een hoekje.
if (params.get('peek')) seedPeekForPreview(Number(params.get('peek')))

// ?moment=reveal|catch|complete|milestone|gotcha&at=ms: moment zo starten dat de screenshot (na 7 s) op `at` ms valt.
const momentParam = params.get('moment')
if (momentParam) {
  const at = Number(params.get('at') ?? 800)
  const card = CARDS[Number(params.get('idx') ?? 0)]?.card ?? CARDS[0].card
  window.setTimeout(() => {
    if (momentParam === 'complete') showMoment({ kind: 'complete', setName: '151' })
    else if (momentParam === 'milestone') showMoment({ kind: 'milestone', level: 25, caption: '25 cards in 151' })
    else if (momentParam === 'gotcha') showMoment({ kind: 'gotcha', name: 'Charizard ex' })
    else if (momentParam === 'badge') showMoment({ kind: 'badge', name: 'Thunder Badge', color: 'var(--energy-lightning)' })
    else if (momentParam === 'dex') showMoment({ kind: 'dex', dexId: 573, name: 'Cinccino', more: 2 })
    else if (momentParam === 'level') showMoment({ kind: 'level', level: 12, trainer: 'Lars' })
    else if (momentParam === 'achievement') showMoment({ kind: 'achievement', name: 'Professor Oak’s Lab', how: 'Own a Pokémon from each Kanto starter line.' })
    else if (momentParam === 'almost') showMoment({ kind: 'almost', setName: '151', left: 2, missing: ['Mew ex #151', 'Charizard ex #199'] })
    else if (momentParam === 'pack')
      showMoment({
        kind: 'pack',
        cards: [
          { card: CARDS[5].card, rarity: 'Common' },
          { card: CARDS[2].card, rarity: 'Holo Rare V' },
          { card: CARDS[3].card, rarity: 'Rare' },
          { card: CARDS[1].card, rarity: 'Double rare' },
          { card: CARDS[0].card, rarity: 'Special illustration rare' },
        ],
      })
    else showMoment({ kind: 'reveal', card, rarity: params.get('rarity') ?? 'Double rare', type: 'Psychic', caught: momentParam === 'catch' })
  }, 7000 - at)
}

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
      <a href="#/sets" className="back">
        <IconArrowLeft size={18} />
        All sets
      </a>
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

/** Overview met werkende kaartpopup (zoals DashboardPage), om bv. kaart openen vanuit de Pokédex te testen. */
function OverviewPreview(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null)
  const cards = CARDS.map((c) => c.card)
  const open = cards.find((c) => c.id === openId) ?? null
  return (
    <>
      <DashboardView
        cards={cards}
        prices={PRICES}
        pricesLoading={false}
        series={SERIES}
        onOpenCard={setOpenId}
        breakdown={<ValueBreakdown cards={cards} prices={PRICES} pricesLoading={false} snapshots={null} />}
        deals={<WishDeals cards={cards} />}
      />
      {open && (
        <CardDialog key={open.id} card={open} defaultStatus={open.status} nextSortOrder={0} onClose={() => setOpenId(null)} onSaved={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />
      )}
    </>
  )
}

export function Preview(): JSX.Element {
  const page = (params.get('page') ?? 'collection') as Route
  const noop = useMemo(() => () => undefined, [])
  if ((params.get('page') ?? '') === 'setcard') {
    return (
      <Shell route="sets" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <SetCardSheet
          lang="en"
          card={{ id: 'sv03.5-016', localId: '016', name: 'Pidgey', image: 'https://assets.tcgdex.net/en/sv/sv03.5/016' }}
          setName="151"
          owned={params.get('copies') ? 3 : 0}
          copies={
            params.get('copies')
              ? [
                  { ...CARDS[0].card, id: 'p1', name: 'Pidgey', variant: 'reverse', condition: 'NM', language: 'en', quantity: 1 },
                  { ...CARDS[0].card, id: 'p2', name: 'Pidgey', variant: 'normal', condition: 'EX', language: 'en', quantity: 2 },
                ]
              : undefined
          }
          nav={params.get('nav') ? { position: 9, total: 34, onPrev: noop, onNext: noop } : undefined}
          onClose={noop}
        />
      </Shell>
    )
  }
  if ((params.get('page') ?? '') === 'zoom') {
    return (
      <Shell route="collection" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <CardZoom label="Mew ex" onClose={noop}>
          <CardImage tcgdexId="en/sv03.5-151" kind="card" name="Mew ex" quality="high" />
        </CardZoom>
      </Shell>
    )
  }
  if ((params.get('page') ?? '') === 'camera') {
    return <CameraCapture wide={params.get('wide') === '1'} onCapture={noop} onPickFile={noop} onClose={noop} />
  }
  if ((params.get('page') ?? '') === 'setlist') {
    return (
      <Shell route="sets" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <SetsPage />
      </Shell>
    )
  }
  if ((params.get('page') ?? '') === 'binder') {
    return (
      <Shell route="sets" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <SetBinderPage param={params.get('set') ?? 'en/sv03.5'} />
      </Shell>
    )
  }
  if ((params.get('page') ?? '') === 'card') {
    const base = CARDS[Number(params.get('idx') ?? 0)]?.card ?? CARDS[0].card
    const demoCard = params.get('name') ? { ...base, name: params.get('name') ?? base.name } : base
    const edit = params.get('edit') === '1'
    return (
      <Shell route="collection" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        <CardDialog
          card={edit ? null : demoCard}
          initial={edit ? demoCard : undefined}
          defaultStatus="collection"
          nextSortOrder={0}
          onClose={noop}
          onSaved={noop}
          onDeleted={noop}
        />
      </Shell>
    )
  }
  const extra = params.get('page') ?? ''
  const extraPage = extra
  if (extra === 'sale' || extra === 'purchase' || extra === 'tx') {
    const picked = [CARDS[0].card, CARDS[4].card, CARDS[5].card]
    const demoTx: Transaction = {
      id: 'tx1',
      kind: 'sale',
      occurred_on: '2026-10-14',
      channel: 'Cardmarket',
      counterparty: 'pikafan92',
      amount: 18,
      shipping_amount: 1.5,
      fees_amount: null,
      shipping_cost: 2.1,
      refund_amount: null,
      status: 'shipped',
      notes: null,
      created_at: '',
      lines: picked.map((c, i) => ({ id: `l${i}`, card_id: c.id, quantity: 1, unit_amount: null })),
    }
    return (
      <Shell route="collection" email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        {extra === 'sale' && <SaleDialog cards={picked} onClose={noop} onSaved={noop} />}
        {extra === 'purchase' && <PurchaseDialog cards={picked} onClose={noop} onSaved={noop} />}
        {extra === 'tx' && (
          <TransactionDialog tx={demoTx} cards={new Map(picked.map((c) => [c.id, c]))} purchases={[]} onClose={noop} onChanged={noop} />
        )}
      </Shell>
    )
  }
  if (page === 'more' || page === 'backup' || page === 'settings' || page === 'wishlist' || page === 'transactions' || page === 'import' || page === 'crate' || page === 'admin' || extraPage === 'collectionpage') {
    return (
      <Shell route={page} email="demo@example.com" theme={theme} onToggleTheme={noop} onSignOut={noop}>
        {page === 'more' && <MorePage />}
        {page === 'backup' && <BackupPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'wishlist' && <WishlistPage />}
        {page === 'transactions' && <TransactionsPage />}
        {page === 'import' && <ImportPage />}
        {page === 'crate' && <CratePage />}
        {page === 'admin' && <AdminPage />}
        {extraPage === 'collectionpage' && <CollectionPage />}
      </Shell>
    )
  }
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
        <OverviewPreview />
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
            <IconSearch size={18} />
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

