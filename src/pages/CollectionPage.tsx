import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { CardDialog } from '../components/CardDialog'
import { BulkEditDialog, type BulkChange } from '../components/BulkEditDialog'
import { CardTile } from '../components/CardTile'
import { CardRow } from '../components/CardRow'
import { ViewToggle } from '../components/ViewToggle'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { LIST_VIEWS, type ListView } from '../lib/listView'
import { NO_EXTRA_FILTERS, activeFilterCount, isUnlinked, matchesExtra, needsCatalog, type ExtraFilters } from '../lib/collectionFilters'
import { CollectionFilterPanel } from '../components/CollectionFilterPanel'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import type { CardInfo } from '../lib/tcgdex'
import { PurchaseDialog } from '../components/PurchaseDialog'
import { SaleDialog } from '../components/SaleDialog'
import { useNewCardDefaults } from '../hooks/useNewCardDefaults'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { IconClose, IconEdit, IconPlus, IconReceipt, IconSearch, IconTag } from '../components/Icons'
import { useDismissedIds } from '../hooks/useDismissedIds'
import { SearchClear } from '../components/SearchClear'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { listCards, updateCard } from '../lib/db'
import { compareOrder, swapOrder, useDragSwap } from '../lib/dragSwap'
import { marketValueOf, type MarketValue } from '../lib/prices'
import { matchesSearch } from '../lib/search'
import { formatEur } from '../lib/stats'
import { canToggleSold, statusFields, type Card, type CardInput, type CardStatus } from '../lib/types'
import { Loading } from '../components/Loading'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { FILTERS, VIEW_KEY, comparePrice, matchesFilter, readView, relevantPrice, type SortKey, type StatusFilter } from '../lib/collectionView'
import { useSetOptions } from '../hooks/useSetOptions'
import { useLoadMore } from '../hooks/useLoadMore'
import { useSavedScroll, useScrollMemory } from '../hooks/useScrollMemory'
import { OFFLINE_TEXT, errorText, isNetworkError } from '../lib/errors'

/** Zoveel kaarten per keer tonen; meer zodra je bij het einde komt. */
const CARDS_PER_STEP = 48

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
  // Kaartinfo (illustrator, zeldzaamheid, types) alleen laden als je op de catalogus filtert.
  const catalogKeys = useMemo(() => (cards ?? []).flatMap((c) => (c.tcgdex_id ? [c.tcgdex_id] : [])), [cards])
  const infos = useCatalogInfos(catalogKeys, needsCatalog(extra))
  const setOptions = useSetOptions(cards, filter)
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
        if (!cancelled) setLoadError(errorText(err, 'Loading failed.'))
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
    if (sort === 'list') sorted.sort(compareOrder)
    if (sort === 'newest') sorted.sort((a, b) => compareOrder(b, a))
    const marketOf = (c: Card): number | null => marketById.get(c.id)?.value ?? null
    if (sort === 'priceDesc') sorted.sort((a, b) => comparePrice(a, b, -1, marketOf))
    if (sort === 'priceAsc') sorted.sort((a, b) => comparePrice(a, b, 1, marketOf))
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

  // Alleen binnen de gekozen status (Owned, Sold …), zodat het aantal klopt met wat je ziet.
  const unlinkedIds = useMemo(() => (cards ?? []).filter((c) => matchesFilter(c, filter) && isUnlinked(c)).map((c) => c.id), [cards, filter])
  const unlinked = unlinkedIds.length
  // Weggeklikt: pas weer tonen als er een nieuwe niet-gekoppelde kaart bij komt.
  const unlinkedNotice = useDismissedIds('dexcrate:unlinked-dismissed')

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
        setActionError(errorText(err, 'Update failed.'))
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
      setActionError(isNetworkError(err) ? OFFLINE_TEXT : err instanceof Error ? `Undo failed: ${err.message}` : 'Undo failed.')
    }
  }

  const afterTransaction = (): void => {
    setSaleFor(null)
    setPurchaseFor(null)
    setSelected(null)
    setReloadKey((k) => k + 1)
  }
  const onToggle = useCallback((id: string) => void toggleSold(id), [toggleSold])

  // Slepen: twee kaarten wisselen van plek in je eigen volgorde (opgeslagen in sort_order).
  const binderRef = useRef<HTMLUListElement>(null)
  // Grote kaarten of lijst (21-10-2026, op verzoek), per apparaat onthouden.
  const [layout, setLayout] = useStoredChoice<ListView>('dexcrate:collection-layout', LIST_VIEWS, 'grid')
  const savingOrder = useRef(false)
  const sortable = layout === 'grid' && (sort === 'list' || sort === 'newest') && selected === null && cards !== null
  const swapCards = useCallback(
    async (fromId: string, toId: string): Promise<void> => {
      if (!cards || savingOrder.current) return
      const changes = swapOrder(cards, fromId, toId)
      if (changes.size === 0) return
      savingOrder.current = true
      setActionError(null)
      setCards((list) =>
        list?.map((c) => {
          const v = changes.get(c.id)
          return v === undefined ? c : { ...c, sort_order: v }
        }) ?? null,
      )
      try {
        for (const [id, v] of changes) await updateCard(id, { sort_order: v })
      } catch (err) {
        setActionError(isNetworkError(err) ? OFFLINE_TEXT : err instanceof Error ? `Saving the new order failed: ${err.message}` : 'Saving the new order failed.')
        setReloadKey((k) => k + 1) // terug naar wat er echt is opgeslagen
      } finally {
        savingOrder.current = false
      }
    },
    [cards],
  )
  const onSwap = useCallback((fromId: string, toId: string) => void swapCards(fromId, toId), [swapCards])
  useDragSwap(binderRef, sortable, onSwap)

  // Lange collecties in stukken tonen (sneller op de telefoon); opnieuw beginnen bij andere filters of sortering.
  // Terug op deze pagina (bv. na een set): evenveel kaarten tonen en terug naar dezelfde plek (useScrollMemory).
  const scrollSaved = useSavedScroll('collection')
  const { count: shownCount, sentinel: moreRef } = useLoadMore(visible.length, `${query}|${filter}|${sort}|${JSON.stringify(extra)}`, CARDS_PER_STEP, scrollSaved?.count)
  useScrollMemory('collection', scrollSaved, cards !== null, shownCount)

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
          <ViewToggle value={layout} onChange={setLayout} />
          {salesTracked && (
            <button type="button" onClick={() => setSelected((s) => (s === null ? new Set() : null))} aria-pressed={selected !== null}>
              {selected === null ? 'Select' : 'Done'}
            </button>
          )}
          <button type="button" className="primary fab" onClick={() => setEditing({ id: null })}>
            <IconPlus size={18} />
            Add card
          </button>
        </div>
      </div>

      <CollectionFilterPanel
        toolbar={
          <>
            <div className="search">
              <IconSearch size={18} />
              <input
                type="search"
                placeholder="Search name, set or number"
                aria-label="Search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={closeKeyboardOnEnter}
              />
              <SearchClear value={query} onClear={() => setQuery('')} />
            </div>
            <div className="segmented status-filter" role="group" aria-label="Status">
              {FILTERS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} <span className="count">{counts[key]}</span>
                </button>
              ))}
            </div>
            <select className="toolbar-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="newest">Newest first</option>
              <option value="list">Oldest first</option>
              <option value="set">Set and number</option>
              <option value="marketDesc">Market value</option>
              <option value="priceDesc">Price: high to low</option>
              <option value="priceAsc">Price: low to high</option>
              <option value="name">Name A–Z</option>
            </select>
          </>
        }
        extra={extra}
        setExtra={setExtra}
        setOptions={setOptions}
        activeCount={activeFilterCount(extra)}
        canClear={activeFilterCount(extra) > 0 || query.trim() !== ''}
        onClear={() => {
          setExtra(NO_EXTRA_FILTERS)
          setQuery('')
        }}
        resultCount={cards ? visibleCount : undefined}
      />

      {lastBulk && (
        <div className="notice" role="status">
          <p>{lastBulk.length} cards changed.</p>
          <button type="button" onClick={() => void undoBulk()}>
            Undo
          </button>
        </div>
      )}

      {unlinked > 0 && extra.link !== 'unlinked' && unlinkedNotice.hasNew(unlinkedIds) && (
        <div className="notice-dismissable">
          <button
            type="button"
            className="notice notice-action"
            onClick={() => {
              setExtra((f) => ({ ...f, link: 'unlinked' }))
            }}
          >
            {unlinked} {unlinked === 1 ? 'card is' : 'cards are'} not linked yet. Show {unlinked === 1 ? 'it' : 'them'}.
          </button>
          <button type="button" className="ghost icon-btn notice-dismiss" aria-label="Dismiss" title="Dismiss" onClick={() => unlinkedNotice.dismiss(unlinkedIds)}>
            <IconClose />
          </button>
        </div>
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

      {sortable && (
        <p id="binder-order-help" className="visually-hidden">
          Drag a card onto another card to swap them. On a touch screen, hold a card first. With the keyboard: Alt and the left or right arrow.
        </p>
      )}
      {layout === 'list' ? (
        <ul className="tx-list card-rows">
          {visible.slice(0, shownCount).map((c) => (
            <CardRow key={c.id} card={c} market={marketById.get(c.id)} onOpen={open} selected={selected === null ? undefined : selected.has(c.id)} />
          ))}
        </ul>
      ) : (
        <ul ref={binderRef} className={`binder${sortable ? ' is-sortable' : ''}`} aria-describedby={sortable ? 'binder-order-help' : undefined}>
          {visible.slice(0, shownCount).map((c) => (
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
      )}
      {visible.length > shownCount && (
        <div ref={moreRef} className="catalog-more">
          <Loading text={`Loading more cards… (${visible.length - shownCount} left)`} />
        </div>
      )}

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
