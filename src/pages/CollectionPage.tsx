import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { CardDialog } from '../components/CardDialog'
import { CardTile } from '../components/CardTile'
import { IconPlus, IconSearch } from '../components/Icons'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards, updateCard } from '../lib/db'
import { marketValueOf, type MarketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { STATUS_LABELS, type Card, type CardStatus } from '../lib/types'

type StatusFilter = 'all' | 'owned' | CardStatus
type SortKey = 'list' | 'priceDesc' | 'priceAsc' | 'marketDesc' | 'name' | 'set'

const FILTERS: [StatusFilter, string][] = [
  ['owned', 'Owned'],
  ['collection', STATUS_LABELS.collection],
  ['for_sale', STATUS_LABELS.for_sale],
  ['sold', STATUS_LABELS.sold],
  ['all', 'All'],
]

const DEFAULT_CHANNELS = ['Cardmarket', 'WhatsApp', 'Bol.com', 'CatchYourCards']

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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('owned')
  const [sort, setSort] = useState<SortKey>('list')
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
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
    const q = query.trim().toLowerCase()
    const filtered = cards.filter(
      (c) =>
        matchesFilter(c, filter) &&
        (!q || [c.name, c.set_code, c.card_number, c.purchase_channel, c.sale_channel].some((v) => v?.toLowerCase().includes(q))),
    )
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
  }, [cards, query, filter, sort, marketById])

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = { all: 0, owned: 0, collection: 0, for_sale: 0, sold: 0 }
    for (const c of cards ?? []) {
      out.all += c.quantity
      out[c.status] += c.quantity
      if (c.status !== 'sold') out.owned += c.quantity
    }
    return out
  }, [cards])

  const channels = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    for (const c of cards ?? []) {
      if (c.purchase_channel) set.add(c.purchase_channel)
      if (c.sale_channel) set.add(c.sale_channel)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'en'))
  }, [cards])

  const unlinked = useMemo(() => (cards ?? []).filter((c) => c.kind === 'card' && !c.tcgdex_id).length, [cards])

  const toggleSold = useCallback(
    async (id: string): Promise<void> => {
      const current = cards?.find((c) => c.id === id)
      if (!current || current.status === 'collection' || pending.has(id)) return
      // Meerdere stuks: via het bewerkscherm, zodat je kunt kiezen hoeveel.
      if (current.quantity > 1) {
        setEditing({ id })
        return
      }
      const nextStatus: CardStatus = current.status === 'sold' ? 'for_sale' : 'sold'
      const patch = { status: nextStatus, sale_date: nextStatus === 'sold' ? new Date().toLocaleDateString('sv-SE') : null }
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
    [cards, pending],
  )

  const open = useCallback((id: string) => setEditing({ id }), [])
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
        <button type="button" className="primary" onClick={() => setEditing({ id: null })}>
          <IconPlus size={18} />
          Add card
        </button>
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
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="list">Date added</option>
          <option value="set">Set and number</option>
          <option value="marketDesc">Market value</option>
          <option value="priceDesc">Price: high to low</option>
          <option value="priceAsc">Price: low to high</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

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
      {!cards && !loadError && <p aria-live="polite">Loading…</p>}
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
          />
        ))}
      </ul>

      {editing && (
        <CardDialog
          key={editing.id ?? 'new'}
          card={editingCard}
          defaultStatus={filter === 'for_sale' || filter === 'sold' ? filter : 'collection'}
          channels={channels}
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
          onDeleted={(id) => {
            setCards((list) => list?.filter((c) => c.id !== id) ?? null)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
