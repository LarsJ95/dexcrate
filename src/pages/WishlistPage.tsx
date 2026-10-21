import { useEffect, useMemo, useState, type JSX } from 'react'
import { EmptyState } from '../components/EmptyState'
import { FilterPanel } from '../components/FilterPanel'
import { CatalogResults } from '../components/CatalogResults'
import { SetCardSheet } from '../components/SetCardSheet'
import { WishFilterFields } from '../components/WishFilterFields'
import { WishRow } from '../components/WishRow'
import { WishTile } from '../components/WishTile'
import { ViewToggle } from '../components/ViewToggle'
import { LIST_VIEWS, type ListView } from '../lib/listView'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useCardPrices } from '../hooks/useCardPrices'
import { useDbFeature } from '../hooks/useDbFeature'
import { WishlistListSheet } from '../components/WishlistListSheet'
import { IconEdit, IconPlus, IconSearch, IconStar, IconTag } from '../components/Icons'
import { SearchClear } from '../components/SearchClear'
import { WishlistDialog } from '../components/WishlistDialog'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { catalogActive, type CatalogHit } from '../lib/catalogSearch'
import { listCards } from '../lib/db'
import { PRINTED_SETS, isLang, lookupLang, type Lang, type SetCard } from '../lib/tcgdex'
import { marketValue } from '../lib/prices'
import { matchesWords } from '../lib/search'
import { LANGUAGE_LABELS, type Card } from '../lib/types'
import { listWishlist, ownedForWish, type WishlistInput, type WishlistItem } from '../lib/wishlist'
import {
  NO_WISH_FILTERS,
  activeWishFilterCount,
  clearWishChip,
  describeWishFilters,
  matchesWishFilters,
  needsWishCatalog,
  needsWishPrices,
  sameWishFilters,
  wishFilterChips,
  type WishFilters,
} from '../lib/wishFilters'
import {
  hasManualLists,
  hasWishlistLists,
  listChanges,
  listListMembers,
  listWishlistLists,
  setItemLists,
  updateWishlistList,
  type WishlistList,
} from '../lib/wishlistLists'
import { WishListPickSheet } from '../components/WishListPickSheet'
import { Loading } from '../components/Loading'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { errorText } from '../lib/errors'

const matches = (item: WishlistItem, query: string): boolean =>
  matchesWords([item.name, item.set_code, item.card_number, item.card_number && `#${item.card_number}`, item.notes], query)

/** Gekoppelde wens als kaart voor het kaartvenster; null zonder (bruikbare) koppeling. */
function sheetCardOf(item: WishlistItem): { lang: Lang; key: string; card: SetCard } | null {
  const key = item.tcgdex_id
  const slash = key ? key.indexOf('/') : -1
  if (!key || slash < 1) return null
  const lang = key.slice(0, slash)
  const id = key.slice(slash + 1)
  if (!isLang(lang) || !id) return null
  return { lang, key, card: { id, localId: id.slice(id.lastIndexOf('-') + 1), name: item.name, image: null } }
}

/** Wishlist: wat je zoekt, met wat je al hebt (of onderweg is) en de marktprijs. */
export function WishlistPage(): JSX.Element {
  const enabled = useWishlistEnabled()
  // Lijst of grote kaarten (21-10-2026, op verzoek), per apparaat onthouden.
  const [layout, setLayout] = useStoredChoice<ListView>('dexcrate:wishlist-layout', LIST_VIEWS, 'list')
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<WishFilters>(NO_WISH_FILTERS)
  const setFilter = (patch: Partial<WishFilters>): void => setFilters((f) => ({ ...f, ...patch }))
  const { language } = filters
  const wishKeys = useMemo(() => (items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : [])), [items])
  // Slimme lijsten (STAP10): opgeslagen filters.
  const listsEnabled = useDbFeature(hasWishlistLists, 'wishlist-lists')
  const [lists, setLists] = useState<WishlistList[]>([])
  // Prijzen en kaartinfo ook als een slimme lijst ze nodig heeft: anders klopt het aantal op de lijsttegel niet.
  const smartFilters = lists.filter((l) => l.kind === 'smart').map((l) => l.filters)
  const infos = useCatalogInfos(wishKeys, needsWishCatalog(filters) || smartFilters.some(needsWishCatalog))
  const prices = useCardPrices(wishKeys, needsWishPrices(filters) || smartFilters.some(needsWishPrices))
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [listSheet, setListSheet] = useState<WishlistList | 'new' | 'new-manual' | null>(null)
  // Eigen lijsten (STAP17): zelf gekozen wensen per lijst.
  const manualEnabled = useDbFeature(hasManualLists, 'wishlist-manual-lists')
  const [members, setMembers] = useState<Map<string, Set<string>>>(new Map())
  const [picking, setPicking] = useState(false)
  const [listNotice, setListNotice] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const activeList = lists.find((l) => l.id === activeListId) ?? null
  const [editing, setEditing] = useState<WishlistItem | 'new' | null>(null)
  // Startwaarden voor een nieuwe wens.
  const [initial, setInitial] = useState<Partial<WishlistInput> | undefined>(undefined)
  // Eigen wens bekijken als grote kaart (alleen gekoppelde wensen), met bladeren door je wensen.
  const [viewingWish, setViewingWish] = useState<string | null>(null)
  // Kaart uit de kaartendatabase bekijken, met bladeren door de zoekresultaten.
  const [browsing, setBrowsing] = useState<{ hits: readonly CatalogHit[]; index: number; lang: Lang } | null>(null)

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    Promise.all([listWishlist(), listCards()])
      .then(([w, c]) => {
        if (cancelled) return
        setItems(w)
        setCards(c)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading the wishlist failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  useEffect(() => {
    if (listsEnabled !== true) return
    let cancelled = false
    listWishlistLists()
      .then((l) => {
        if (!cancelled) setLists(l)
      })
      .catch((err: unknown) => {
        if (!cancelled) setListNotice(errorText(err, 'Loading your lists failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [listsEnabled])

  useEffect(() => {
    if (manualEnabled !== true) return
    let cancelled = false
    listListMembers()
      .then((m) => {
        if (!cancelled) setMembers(m)
      })
      .catch((err: unknown) => {
        if (!cancelled) setListNotice(errorText(err, 'Loading your lists failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [manualEnabled])

  const manualLists = useMemo(() => (manualEnabled === true ? lists.filter((l) => l.kind === 'manual') : []), [lists, manualEnabled])

  /** Lidmaatschap van één wens lokaal bijwerken (na opslaan in de database). */
  function applyMembership(itemId: string, change: { add: readonly string[]; remove: readonly string[] }): void {
    setMembers((cur) => {
      const next = new Map(cur)
      for (const id of change.add) next.set(id, new Set(next.get(id)).add(itemId))
      for (const id of change.remove) {
        const set = new Set(next.get(id))
        set.delete(itemId)
        next.set(id, set)
      }
      return next
    })
  }

  /** Wens in precies deze eigen lijsten zetten. */
  async function saveMembership(itemId: string, wanted: ReadonlySet<string>): Promise<void> {
    const change = listChanges(members, itemId, wanted, manualLists.map((l) => l.id))
    if (change.add.length === 0 && change.remove.length === 0) return
    try {
      await setItemLists(itemId, change)
      applyMembership(itemId, change)
    } catch (err) {
      setListNotice(errorText(err, 'Saving the list failed.'))
    }
  }

  function newManualList(): void {
    if (manualEnabled !== true) {
      setListNotice('Lists you fill yourself are not set up yet: run STAP17 in Supabase.')
      return
    }
    setListSheet('new-manual')
  }

  function chooseList(list: WishlistList | null): void {
    setActiveListId(list?.id ?? null)
    setFilters(list?.filters ?? NO_WISH_FILTERS)
    setListNotice(null)
  }

  function saveAsList(): void {
    if (listsEnabled !== true) {
      setListNotice('Saving lists is not set up yet: run STAP10 in Supabase.')
      return
    }
    setListSheet('new')
  }

  async function updateActiveList(): Promise<void> {
    if (!activeList || listBusy) return
    setListBusy(true)
    setListNotice(null)
    try {
      const saved = await updateWishlistList(activeList.id, { filters })
      setLists((l) => l.map((x) => (x.id === saved.id ? saved : x)))
    } catch (err) {
      setListNotice(errorText(err, 'Saving the list failed.'))
    } finally {
      setListBusy(false)
    }
  }

  const rows = useMemo(
    () =>
      (items ?? []).map((item) => {
        const have = ownedForWish(item, cards)
        return { item, ...have, found: have.owned >= item.wanted_qty }
      }),
    [items, cards],
  )
  const visible = rows.filter((r) => {
    const key = r.item.tcgdex_id
    // undefined = nog aan het laden (dan niet wegfilteren), null = onbekend.
    const market = !key ? null : prices.has(key) ? (marketValue(prices.get(key) ?? null, r.item.variant)?.value ?? null) : undefined
    const info = !key ? null : infos.has(key) ? (infos.get(key) ?? null) : undefined
    if (activeList?.kind === 'manual' && !members.get(activeList.id)?.has(r.item.id)) return false
    return matches(r.item, query) && matchesWishFilters(r.item, filters, { found: r.found, market, info })
  })
  const foundCount = rows.filter((r) => r.found).length
  // Aantal wensen per lijst, voor de lijsttegels (21-10-2026: lijsten moesten duidelijker); null = nog aan het laden.
  const listCounts = useMemo(() => {
    const counts = new Map<string, number | null>()
    const pricesReady = wishKeys.every((k) => prices.has(k))
    const infosReady = wishKeys.every((k) => infos.has(k))
    for (const l of lists) {
      if (l.kind === 'smart' && ((needsWishPrices(l.filters) && !pricesReady) || (needsWishCatalog(l.filters) && !infosReady))) {
        counts.set(l.id, null)
        continue
      }
      counts.set(
        l.id,
        l.kind === 'manual'
          ? rows.filter((r) => members.get(l.id)?.has(r.item.id)).length
          : rows.filter((r) => {
              const key = r.item.tcgdex_id
              const market = !key ? null : prices.has(key) ? (marketValue(prices.get(key) ?? null, r.item.variant)?.value ?? null) : undefined
              const info = !key ? null : infos.has(key) ? (infos.get(key) ?? null) : undefined
              return matchesWishFilters(r.item, l.filters, { found: r.found, market, info })
            }).length,
      )
    }
    return counts
  }, [lists, rows, members, prices, infos, wishKeys])
  const wishedKeys = useMemo(() => new Set((items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : []))), [items])
  const ownedCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cards) if (c.tcgdex_id && c.ownership === 'owned') map.set(c.tcgdex_id, (map.get(c.tcgdex_id) ?? 0) + c.quantity)
    return map
  }, [cards])
  const ownedKeys = useMemo(() => new Set(ownedCounts.keys()), [ownedCounts])
  // Bladeren in de kaartendatabase (zonder zoekterm) alleen buiten een opgeslagen lijst.
  const searching = activeList ? query.trim().length >= 2 : catalogActive(query, filters, filters.set.trim())
  const filterCount = activeWishFilterCount(filters)
  const listChanged = activeList !== null && !sameWishFilters(filters, activeList.filters)
  const canUpdateList = listChanged && activeList?.kind === 'smart'
  const canSaveList = (filterCount > 0 || filters.showFound) && (listChanged || !activeList)
  const canClear = (filterCount > 0 || query.trim() !== '') && (!activeList || activeList.kind === 'manual')

  function openNew(start?: Partial<WishlistInput>): void {
    setInitial(start)
    setEditing('new')
  }

  /** lists: gekozen eigen lijsten uit het wens-venster; zonder: een nieuwe wens komt in de open eigen lijst. */
  function addSaved(saved: WishlistItem, lists: ReadonlySet<string> | null = null): void {
    const isNew = !(items ?? []).some((x) => x.id === saved.id)
    if (lists) void saveMembership(saved.id, lists)
    else if (isNew && activeList?.kind === 'manual') void saveMembership(saved.id, new Set([activeList.id]))
    setItems((list) => {
      const next = [...(list ?? [])]
      const i = next.findIndex((x) => x.id === saved.id)
      if (i >= 0) next[i] = saved
      else next.unshift(saved)
      return next
    })
  }

  // Gekoppelde wensen zoals ze nu getoond worden: daar blader je doorheen in het kaartvenster.
  const viewable = visible.filter((r) => sheetCardOf(r.item) !== null)
  const wishIndex = viewingWish ? viewable.findIndex((r) => r.item.id === viewingWish) : -1
  const viewed = wishIndex >= 0 ? viewable[wishIndex].item : null
  const viewedCard = viewed ? sheetCardOf(viewed) : null

  const browsed = browsing?.hits[browsing.index] ?? null
  const browsedKey = browsing && browsed ? `${browsing.lang}/${browsed.card.id}` : null
  const goTo = (index: number): void => setBrowsing((b) => (b ? { ...b, index } : b))

  if (enabled === false) {
    return (
      <section className="page">
        <h1>Wishlist</h1>
        <p className="notice">The wishlist is not set up yet (run STAP6 in Supabase).</p>
      </section>
    )
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Wishlist</h1>
          {items && (
            <p className="muted">
              {rows.length - foundCount} wanted{foundCount > 0 ? `, ${foundCount} found` : ''}
            </p>
          )}
        </div>
        <div className="head-actions">
          <ViewToggle value={layout} onChange={setLayout} />
          <button type="button" className="primary fab" onClick={() => openNew()}>
            <IconPlus size={18} />
            Add card
          </button>
        </div>
      </div>

      {(lists.length > 0 || listsEnabled === true) && (
        <section className="wish-lists" aria-labelledby="wish-lists-title">
          <div className="wish-lists-head">
            <h2 id="wish-lists-title" className="section-title">
              Your lists
            </h2>
            {listsEnabled === true && (
              <button type="button" className="small-btn" onClick={newManualList}>
                <IconPlus size={16} />
                New list
              </button>
            )}
          </div>
          <div className="wish-list-tiles" role="group" aria-label="Lists">
            <button type="button" className="wish-list-tile" aria-pressed={activeList === null} onClick={() => chooseList(null)}>
              <span className="wish-list-icon" aria-hidden="true">
                <IconStar size={18} />
              </span>
              <span className="wish-list-text">
                <strong>All wishes</strong>
                <span className="small">
                  {rows.length} {rows.length === 1 ? 'wish' : 'wishes'}
                </span>
              </span>
            </button>
            {lists.map((l) => {
              const n = listCounts.get(l.id)
              return (
                <button key={l.id} type="button" className="wish-list-tile" aria-pressed={activeList?.id === l.id} onClick={() => chooseList(l)}>
                  <span className="wish-list-icon" aria-hidden="true">
                    {l.kind === 'manual' ? <IconTag size={18} /> : <IconSearch size={18} />}
                  </span>
                  <span className="wish-list-text">
                    <strong>{l.name}</strong>
                    <span className="small">
                      {n === null || n === undefined ? '…' : `${n} ${n === 1 ? 'wish' : 'wishes'}`} · {l.kind === 'manual' ? 'picked by you' : describeWishFilters(l.filters) || 'filters'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {lists.length === 0 && (
            <p className="muted small">Make a list: tap “New list” and pick wishes, or set filters below and choose “Save as new list”.</p>
          )}
          {activeList && (
            <div className="wish-list-actions">
              <span className="small">
                <strong>{activeList.name}</strong>: {activeList.kind === 'manual' ? 'a list you fill yourself.' : 'updates itself from its filters.'}
              </span>
              {activeList.kind === 'manual' && (
                <button type="button" className="small-btn" onClick={() => setPicking(true)}>
                  Choose wishes
                </button>
              )}
              <button type="button" className="ghost small-btn" onClick={() => setListSheet(activeList)}>
                Rename or remove
              </button>
            </div>
          )}
        </section>
      )}

      <FilterPanel
        toolbar={
          <>
            <div className="search">
              <IconSearch size={18} />
              <input
                type="search"
                placeholder="Search a Pokémon or card"
                aria-label="Search your wishlist and the card database"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={closeKeyboardOnEnter}
              />
              <SearchClear value={query} onClear={() => setQuery('')} />
            </div>
          </>
        }
        activeCount={filterCount + (filters.showFound ? 1 : 0)}
        canClear={canClear}
        onClear={() => {
          setFilters(NO_WISH_FILTERS)
          setQuery('')
        }}
        chips={wishFilterChips(filters).map((c) => ({ ...c, onRemove: () => setFilter(clearWishChip(c.key)) }))}
        resultCount={items ? visible.length : undefined}
        resultNoun={['wish', 'wishes']}
        actions={
          <>
            {canUpdateList && (
              <button type="button" className="primary small-btn" onClick={() => void updateActiveList()} disabled={listBusy}>
                Update “{activeList.name}”
              </button>
            )}
            {canSaveList && (
              <button type="button" className={listChanged ? 'small-btn' : 'primary small-btn'} onClick={saveAsList}>
                Save as new list
              </button>
            )}
          </>
        }
      >
        <WishFilterFields filters={filters} setFilter={setFilter} />
      </FilterPanel>

      {listNotice && (
        <p className="notice" role="status">
          {listNotice}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && <Loading />}
      {items?.length === 0 && !searching && (
        <EmptyState
          title="Your wishlist is empty"
          action={
            <button type="button" className="primary" onClick={() => openNew()}>
              Add card
            </button>
          }
        >
          Add the cards you’re looking for, with a max. price if you like: the menu shows when one is offered below it. Search for a Pokémon above, or
          select missing cards in a set and tap Wishlist.
        </EmptyState>
      )}
      {items && items.length > 0 && visible.length === 0 && (
        <EmptyState
          action={
            !searching && !activeList && canClear ? (
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  setFilters(NO_WISH_FILTERS)
                  setQuery('')
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        >
          {searching
            ? 'None of your wishes match. Cards from the database are below.'
            : activeList?.kind === 'manual' && (members.get(activeList.id)?.size ?? 0) === 0
              ? 'This list is empty. Tap “Choose wishes”, or tick this list when you add or edit a wish.'
              : activeList
                ? 'No wishes in this list right now.'
                : 'No wishes match these filters.'}
        </EmptyState>
      )}

      {visible.length > 0 &&
        (layout === 'grid' ? (
          <ul className="binder wish-grid">
            {visible.map(({ item, owned, incoming, found }) => (
              <WishTile
                key={item.id}
                item={item}
                owned={owned}
                incoming={incoming}
                found={found}
                onOpen={() => (sheetCardOf(item) ? setViewingWish(item.id) : setEditing(item))}
              />
            ))}
          </ul>
        ) : (
          <ul className="tx-list">
            {visible.map(({ item, owned, incoming, found }) => (
              <WishRow
                key={item.id}
                item={item}
                owned={owned}
                incoming={incoming}
                found={found}
                onOpen={() => (sheetCardOf(item) ? setViewingWish(item.id) : setEditing(item))}
              />
            ))}
          </ul>
        ))}

      {searching && (
        <CatalogResults
          filters={filters}
          setId={filters.set.trim()}
          query={query}
          lang={lookupLang(language || null)}
          wished={wishedKeys}
          owned={ownedKeys}
          onPick={(hits, index, lang) => setBrowsing({ hits, index, lang })}
          note={
            // Europese talen hebben geen eigen kaartdata (TCGdex): zelfde set en nummer als Engels.
            language === 'nl'
              ? 'Dutch cards exist only for Base Set, Jungle and Fossil. Shown with English data (same set and number).'
              : language && !isLang(language)
                ? `No ${LANGUAGE_LABELS[language]} card data: showing English prints (same set and number).`
                : null
          }
          onlySets={language ? (PRINTED_SETS[language] ?? null) : null}
        />
      )}

      {browsing && browsed && browsedKey && (
        <SetCardSheet
          lang={browsing.lang}
          card={browsed.card}
          setName={browsed.set?.name ?? browsed.setId}
          setId={browsed.setId}
          owned={ownedCounts.get(browsedKey) ?? 0}
          wishLanguage={language || null}
          wished={wishedKeys.has(browsedKey)}
          onWishSaved={addSaved}
          nav={{
            position: browsing.index + 1,
            total: browsing.hits.length,
            onPrev: browsing.index > 0 ? () => goTo(browsing.index - 1) : null,
            onNext: browsing.index < browsing.hits.length - 1 ? () => goTo(browsing.index + 1) : null,
          }}
          onClose={() => setBrowsing(null)}
        />
      )}

      {viewed && viewedCard && (
        <SetCardSheet
          lang={viewedCard.lang}
          card={viewedCard.card}
          owned={ownedCounts.get(viewedCard.key) ?? 0}
          wished
          nav={{
            position: wishIndex + 1,
            total: viewable.length,
            onPrev: wishIndex > 0 ? () => setViewingWish(viewable[wishIndex - 1].item.id) : null,
            onNext: wishIndex < viewable.length - 1 ? () => setViewingWish(viewable[wishIndex + 1].item.id) : null,
          }}
          actions={
            <button type="button" className="small-btn" onClick={() => setEditing(viewed)}>
              <IconEdit size={16} />
              Edit wish
            </button>
          }
          onClose={() => setViewingWish(null)}
        />
      )}

      {listSheet && (
        <WishlistListSheet
          list={listSheet === 'new' || listSheet === 'new-manual' ? null : listSheet}
          kind={listSheet === 'new-manual' ? 'manual' : 'smart'}
          count={typeof listSheet === 'object' ? (members.get(listSheet.id)?.size ?? 0) : 0}
          filters={filters}
          existing={lists}
          onClose={() => setListSheet(null)}
          onSaved={(saved) => {
            setLists((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]))
            setActiveListId(saved.id)
            setFilters(saved.filters)
            setListSheet(null)
          }}
          onDeleted={(id) => {
            setLists((l) => l.filter((x) => x.id !== id))
            setMembers((m) => {
              const next = new Map(m)
              next.delete(id)
              return next
            })
            chooseList(null)
            setListSheet(null)
          }}
        />
      )}

      {editing && (
        <WishlistDialog
          item={editing === 'new' ? null : editing}
          initial={editing === 'new' ? initial : undefined}
          onClose={() => setEditing(null)}
          lists={manualLists}
          inLists={
            editing === 'new'
              ? new Set(activeList?.kind === 'manual' ? [activeList.id] : [])
              : new Set(manualLists.filter((l) => members.get(l.id)?.has(editing.id)).map((l) => l.id))
          }
          onSaved={(saved, chosen) => {
            addSaved(saved, chosen)
            setEditing(null)
          }}
          onDeleted={(id) => {
            setItems((list) => list?.filter((x) => x.id !== id) ?? null)
            // De database haalt de wens zelf uit alle lijsten (cascade).
            setMembers((m) => new Map([...m].map(([listId, set]) => [listId, new Set([...set].filter((x) => x !== id))])))
            setEditing(null)
          }}
        />
      )}

      {picking && activeList?.kind === 'manual' && (
        <WishListPickSheet
          list={activeList}
          items={items ?? []}
          members={members.get(activeList.id) ?? new Set()}
          onClose={() => setPicking(false)}
          onSaved={(chosen) => {
            setMembers((m) => new Map(m).set(activeList.id, new Set(chosen)))
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}
