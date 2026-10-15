import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { CardDialog } from '../components/CardDialog'
import { BulkEditDialog, type BulkChange } from '../components/BulkEditDialog'
import { CardTile } from '../components/CardTile'
import { useLocations } from '../hooks/useLocations'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { NO_EXTRA_FILTERS, activeFilterCount, matchesExtra, needsCatalog, parseView, type ExtraFilters, type SavedView } from '../lib/collectionFilters'
import { CatalogFilterFields } from '../components/CatalogFilterFields'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import type { CardInfo } from '../lib/tcgdex'
import { PurchaseDialog } from '../components/PurchaseDialog'
import { SaleDialog } from '../components/SaleDialog'
import { useNewCardDefaults } from '../hooks/useNewCardDefaults'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { IconEdit, IconPlus, IconReceipt, IconSearch, IconTag } from '../components/Icons'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards, updateCard } from '../lib/db'
import { marketValueOf, type MarketValue } from '../lib/prices'
import { matchesSearch } from '../lib/search'
import { formatEur } from '../lib/stats'
import {
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  STATUS_LABELS,
  VARIANT_LABELS,
  canToggleSold,
  statusFields,
  type Card,
  type CardInput,
  type CardStatus,
} from '../lib/types'
import { Loading } from '../components/Loading'

type StatusFilter = 'all' | 'owned' | CardStatus
type SortKey = 'list' | 'priceDesc' | 'priceAsc' | 'marketDesc' | 'name' | 'set'
const SORTS: readonly SortKey[] = ['list', 'priceDesc', 'priceAsc', 'marketDesc', 'name', 'set']
const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'owned', 'collection', 'for_sale', 'sold']

/** Weergave (zoeken, filters, sortering) per apparaat onthouden. */
const VIEW_KEY = 'dexcrate:collection-view'
const DEFAULT_VIEW: SavedView<SortKey, StatusFilter> = { query: '', filter: 'owned', sort: 'list', extra: NO_EXTRA_FILTERS }

function readView(): SavedView<SortKey, StatusFilter> {
  try {
    return parseView(localStorage.getItem(VIEW_KEY), SORTS, STATUS_FILTERS, DEFAULT_VIEW)
  } catch {
    return DEFAULT_VIEW // geen opslag: standaardweergave
  }
}

const FILTERS: [StatusFilter, string][] = [
  ['owned', 'Owned'],
  ['collection', STATUS_LABELS.collection],
  ['for_sale', STATUS_LABELS.for_sale],
  ['sold', STATUS_LABELS.sold],
  ['all', 'All'],
]

/** Prijs die bij de status hoort, voor sorteren en totalen. */
function relevantPrice(c: Card): number {
  return (c.status === 'collection' ? c.purchase_price : c.sale_price) ?? 0
}

function matchesFilter(c: Card, f: StatusFilter): boolean {
  if (f === 'all') return true
  if (f === 'owned') return c.status !== 'sold'
  return c.status === f
}

export function CollectionPage(): JSX.Element {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [initialView] = useState(readView)
  const [query, setQuery] = useState(initialView.query)
  const [filter, setFilter] = useState<StatusFilter>(initialView.filter)
  const [sort, setSort] = useState<SortKey>(initialView.sort)
  const [extra, setExtra] = useState<ExtraFilters>(initialView.extra)
  const [showFilters, setShowFilters] = useState(activeFilterCount(initialView.extra) > 0)
  // Kaartinfo (illustrator, zeldzaamheid, types) alleen laden als je op de catalogus filtert.
  const catalogKeys = useMemo(() => (cards ?? []).flatMap((c) => (c.tcgdex_id ? [c.tcgdex_id] : [])), [cards])
  const infos = useCatalogInfos(catalogKeys, needsCatalog(extra))
  const v2 = useSchemaV2() === true
  const locations = useLocations(v2)
  const [bulkFor, setBulkFor] = useState<Card[] | null>(null)
  const [lastBulk, setLastBulk] = useState<BulkChange[] | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ query, filter, sort, extra }))
    } catch (err) {
      console.warn('Weergave onthouden mislukt', err)
    }
  }, [query, filter, sort, extra])
  // Verkopen en aankopen als transactie (STAP5): kaarten selecteren en in één keer vastleggen.
  const salesTracked = useTransactionsEnabled() === true
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null)
  const [saleFor, setSaleFor] = useState<Card[] | null>(null)
  const [purchaseFor, setPurchaseFor] = useState<Card[] | null>(null)
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const newCardDefaults = useNewCardDefaults()
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const { prices, loading: pricesLoading } = useMarketPrices(cards)

  // Per regel de marktwaarde; undefined zolang de prijs nog geladen wordt.
  const marketById = useMemo(() => {
    const map = new Map<string, MarketValue | null | undefined>()
    for (const c of cards ?? []) {
      const known = c.tcgdex_id ? prices.has(c.tcgdex_id) : true
      map.set(c.id, !known && pricesLoading ? undefined : marketValueOf(c, prices))
    }
    return map
  }, [cards, prices, pricesLoading])

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((rows) => {
        if (!cancelled) setCards(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Loading failed.')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const visible = useMemo(() => {
    if (!cards) return []
    const infoOf = (c: CardInput): CardInfo | null | undefined => (c.tcgdex_id ? (infos.has(c.tcgdex_id) ? infos.get(c.tcgdex_id) : undefined) : null)
    const filtered = cards.filter((c) => matchesFilter(c, filter) && matchesSearch(c, query) && matchesExtra(c, extra, infoOf))
    const sorted = [...filtered]
    if (sort === 'priceDesc') sorted.sort((a, b) => relevantPrice(b) - relevantPrice(a))
    if (sort === 'priceAsc') sorted.sort((a, b) => relevantPrice(a) - relevantPrice(b))
    if (sort === 'marketDesc') {
      sorted.sort((a, b) => (marketById.get(b.id)?.value ?? -1) - (marketById.get(a.id)?.value ?? -1))
    }
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    if (sort === 'set') {
      sorted.sort(
        (a, b) =>
          (a.set_code ?? '').localeCompare(b.set_code ?? '', 'en') ||
          (Number.parseInt(a.card_number ?? '', 10) || 0) - (Number.parseInt(b.card_number ?? '', 10) || 0),
      )
    }
    return sorted
  }, [cards, query, filter, sort, marketById, extra, infos])

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = { all: 0, owned: 0, collection: 0, for_sale: 0, sold: 0 }
    for (const c of cards ?? []) {
      out.all += c.quantity
      out[c.status] += c.quantity
      if (c.status !== 'sold') out.owned += c.quantity
    }
    return out
  }, [cards])

  const unlinked = useMemo(() => (cards ?? []).filter((c) => c.kind === 'card' && !c.tcgdex_id).length, [cards])

  const toggleSold = useCallback(
    async (id: string): Promise<void> => {
      const current = cards?.find((c) => c.id === id)
      if (!current || !canToggleSold(current) || pending.has(id)) return
      // Met transacties: verkopen via de verkoopdialoog (kosten, lot, status), niet als los vinkje.
      if (salesTracked) {
        if (current.ownership === 'owned') setSaleFor([current])
        return
      }
      // Meerdere stuks: via het bewerkscherm, zodat je kunt kiezen hoeveel.
      if (current.quantity > 1) {
        setEditing({ id })
        return
      }
      const nextStatus: CardStatus = current.status === 'sold' ? 'for_sale' : 'sold'
      const patch = { ...statusFields(nextStatus), sale_date: nextStatus === 'sold' ? new Date().toLocaleDateString('sv-SE') : null }
      setActionError(null)
      setPending((p) => new Set(p).add(id))
      setCards((list) => list?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? null)
      try {
        await updateCard(id, patch)
      } catch (err) {
        setCards((list) => list?.map((c) => (c.id === id ? current : c)) ?? null)
        setActionError(err instanceof Error ? err.message : 'Update failed.')
      } finally {
        setPending((p) => {
          const n = new Set(p)
          n.delete(id)
          return n
        })
      }
    },
    [cards, pending, salesTracked],
  )

  const open = useCallback(
    (id: string) => {
      if (selected === null) {
        setEditing({ id })
        return
      }
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [selected],
  )

  const selectedCards = selected ? (cards ?? []).filter((c) => selected.has(c.id)) : []
  const canSell = selectedCards.length > 0 && selectedCards.every((c) => c.ownership === 'owned')
  const canBuy = selectedCards.length > 0 && selectedCards.every((c) => c.ownership === 'owned' || c.ownership === 'incoming')
  /** Laatste bulkwijziging terugdraaien (oude waarden terugzetten). */
  async function undoBulk(): Promise<void> {
    if (!lastBulk) return
    const changes = lastBulk
    setLastBulk(null)
    setActionError(null)
    try {
      const restored: Card[] = []
      for (const ch of changes) restored.push(await updateCard(ch.id, ch.before))
      setCards((list) => list?.map((c) => restored.find((r) => r.id === c.id) ?? c) ?? null)
    } catch (err) {
      setActionError(err instanceof Error ? `Undo failed: ${err.message}` : 'Undo failed.')
    }
  }

  const afterTransaction = (): void => {
    setSaleFor(null)
    setPurchaseFor(null)
    setSelected(null)
    setReloadKey((k) => k + 1)
  }
  const onToggle = useCallback((id: string) => void toggleSold(id), [toggleSold])

  const editingCard = editing?.id ? (cards?.find((c) => c.id === editing.id) ?? null) : null
  const nextSortOrder = (cards ?? []).reduce((m, c) => Math.max(m, c.sort_order), -1) + 1
  const visibleCount = visible.reduce((n, c) => n + c.quantity, 0)
  const visibleValue = visible.reduce((cents, c) => cents + c.quantity * Math.round(relevantPrice(c) * 100), 0) / 100
  let marketCents = 0
  let marketMissing = 0
  for (const c of visible) {
    if (c.status === 'sold') continue
    const mv = marketById.get(c.id)
    if (mv) marketCents += c.quantity * Math.round(mv.value * 100)
    else marketMissing += c.quantity
  }
  const visibleMarket = { value: marketCents / 100, missing: marketMissing }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Collection</h1>
          {cards && (
            <p className="muted">
              {visibleCount} {visibleCount === 1 ? 'card' : 'cards'}
              {filter === 'sold'
                ? `, sold for ${formatEur(visibleValue)}`
                : pricesLoading
                  ? ''
                  : `, market value ${formatEur(visibleMarket.value)}`}
            </p>
          )}
        </div>
        <div className="head-actions">
          {salesTracked && (
            <button type="button" onClick={() => setSelected((s) => (s === null ? new Set() : null))} aria-pressed={selected !== null}>
              {selected === null ? 'Select' : 'Done'}
            </button>
          )}
          <button type="button" className="primary" onClick={() => setEditing({ id: null })}>
            <IconPlus size={18} />
            Add card
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="search">
          <IconSearch size={18} />
          <input
            type="search"
            placeholder="Search name, set or number"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Status">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
          Filters{activeFilterCount(extra) > 0 ? ` (${activeFilterCount(extra)})` : ''}
        </button>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="list">Date added</option>
          <option value="set">Set and number</option>
          <option value="marketDesc">Market value</option>
          <option value="priceDesc">Price: high to low</option>
          <option value="priceAsc">Price: low to high</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {showFilters && (
        <div className="panel extra-filters">
          <div className="form-grid">
            <label>
              Language
              <select value={extra.language} onChange={(e) => setExtra((f) => ({ ...f, language: e.target.value as ExtraFilters['language'] }))}>
                <option value="">All</option>
                <option value="none">Unknown</option>
                {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Variant
              <select value={extra.variant} onChange={(e) => setExtra((f) => ({ ...f, variant: e.target.value as ExtraFilters['variant'] }))}>
                <option value="">All</option>
                <option value="none">Unknown</option>
                {Object.entries(VARIANT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select value={extra.condition} onChange={(e) => setExtra((f) => ({ ...f, condition: e.target.value as ExtraFilters['condition'] }))}>
                <option value="">All</option>
                <option value="none">Unknown</option>
                {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {locations.length > 0 && (
              <label>
                Location
                <select value={extra.location} onChange={(e) => setExtra((f) => ({ ...f, location: e.target.value }))}>
                  <option value="">All</option>
                  <option value="none">No location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <CatalogFilterFields value={extra} onChange={(next) => setExtra((f) => ({ ...f, ...next }))} />
            <label>
              Illustrator
              <input value={extra.illustrator} maxLength={60} placeholder="e.g. Arita" onChange={(e) => setExtra((f) => ({ ...f, illustrator: e.target.value }))} />
            </label>
          </div>
          {activeFilterCount(extra) > 0 && (
            <button type="button" className="ghost small-btn" onClick={() => setExtra(NO_EXTRA_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {lastBulk && (
        <div className="notice" role="status">
          <p>{lastBulk.length} cards changed.</p>
          <button type="button" onClick={() => void undoBulk()}>
            Undo
          </button>
        </div>
      )}

      {unlinked > 0 && (
        <p className="notice">
          {unlinked} {unlinked === 1 ? 'card is' : 'cards are'} not linked yet. Open a card to link it.
        </p>
      )}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {loadError && (
        <div className="notice" role="alert">
          <p className="error">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setReloadKey((k) => k + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!cards && !loadError && <Loading />}
      {cards && cards.length === 0 && (
        <p className="empty">
          Your collection is empty. Add a card or <a href="#/import">import your Excel file</a>.
        </p>
      )}
      {cards && cards.length > 0 && visible.length === 0 && <p className="empty">No cards match these filters.</p>}

      <ul className="binder">
        {visible.map((c) => (
          <CardTile
            key={c.id}
            card={c}
            market={marketById.get(c.id)}
            onOpen={open}
            onToggleSold={onToggle}
            busy={pending.has(c.id)}
            selected={selected === null ? undefined : selected.has(c.id)}
            salesTracked={salesTracked}
          />
        ))}
      </ul>

      {selected !== null && (
        <div className="select-bar" role="region" aria-label="Selection">
          <span className="select-count">{selectedCards.length === 0 ? 'Tap cards' : `${selectedCards.length} selected`}</span>
          <span className="spacer" />
          <button type="button" className="small-btn" disabled={selectedCards.length === 0} onClick={() => setBulkFor(selectedCards)}>
            <IconEdit size={16} />
            Edit
          </button>
          <button type="button" className="small-btn" disabled={!canBuy} onClick={() => setPurchaseFor(selectedCards)} title="Record a purchase">
            <IconReceipt size={16} />
            Bought
          </button>
          <button type="button" className="primary small-btn" disabled={!canSell} onClick={() => setSaleFor(selectedCards)}>
            <IconTag size={16} />
            Sell
          </button>
        </div>
      )}

      {bulkFor && (
        <BulkEditDialog
          cards={bulkFor}
          locations={locations}
          onClose={() => setBulkFor(null)}
          onApplied={(rows, changes, error) => {
            setCards((list) => list?.map((c) => rows.find((r) => r.id === c.id) ?? c) ?? null)
            setLastBulk(changes.length > 0 ? changes : null)
            setActionError(error)
            setBulkFor(null)
            setSelected(null)
          }}
        />
      )}

      {saleFor && <SaleDialog cards={saleFor} onClose={() => setSaleFor(null)} onSaved={afterTransaction} />}
      {purchaseFor && <PurchaseDialog cards={purchaseFor} onClose={() => setPurchaseFor(null)} onSaved={afterTransaction} />}

      {editing && (
        <CardDialog
          key={editing.id ?? 'new'}
          card={editingCard}
          initial={editingCard ? undefined : { language: 'en', ...newCardDefaults }}
          defaultStatus={filter === 'for_sale' || filter === 'sold' ? filter : 'collection'}
          nextSortOrder={nextSortOrder}
          onClose={() => setEditing(null)}
          onSaved={(rows) => {
            setCards((list) => {
              const next = [...(list ?? [])]
              for (const row of rows) {
                const i = next.findIndex((c) => c.id === row.id)
                if (i >= 0) next[i] = row
                else next.push(row)
              }
              return next
            })
            setEditing(null)
          }}
          onChanged={(row) => setCards((list) => list?.map((c) => (c.id === row.id ? row : c)) ?? null)}
          onSold={() => {
            setEditing(null)
            setReloadKey((k) => k + 1)
          }}
          onDeleted={(id) => {
            setCards((list) => list?.filter((c) => c.id !== id) ?? null)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
