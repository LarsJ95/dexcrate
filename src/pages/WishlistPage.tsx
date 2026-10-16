import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardImage } from '../components/CardImage'
import { CatalogFilterFields } from '../components/CatalogFilterFields'
import { CardmarketLink } from '../components/CardmarketLink'
import { CatalogResults } from '../components/CatalogResults'
import { SetPicker } from '../components/SetPicker'
import { CardSetSymbol } from '../components/SetIcon'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useCardPrices } from '../hooks/useCardPrices'
import { useDbFeature } from '../hooks/useDbFeature'
import { WishlistListSheet } from '../components/WishlistListSheet'
import { IconPlus, IconSearch } from '../components/Icons'
import { WishlistDialog } from '../components/WishlistDialog'
import { useCardPrice } from '../hooks/useCardPrice'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { catalogActive, type CatalogHit } from '../lib/catalogSearch'
import { listCards } from '../lib/db'
import { PRINTED_SETS, getSet, isLang, lookupLang, type Lang } from '../lib/tcgdex'
import { marketValue } from '../lib/prices'
import { matchesWords } from '../lib/search'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type Card, type CardLanguage, type Variant } from '../lib/types'
import { listWishlist, ownedForWish, type WishlistInput, type WishlistItem } from '../lib/wishlist'
import {
  NO_WISH_FILTERS,
  activeWishFilterCount,
  describeWishFilters,
  matchesWishFilters,
  needsWishCatalog,
  needsWishPrices,
  sameWishFilters,
  type WishFilters,
} from '../lib/wishFilters'
import { hasWishlistLists, listWishlistLists, updateWishlistList, type WishlistList } from '../lib/wishlistLists'
import { Loading } from '../components/Loading'

const PRIORITY: Record<1 | 2 | 3, string> = { 1: 'High priority', 2: '', 3: 'Low priority' }

/** Marktprijs van de gezochte uitvoering, met "onder je maximum" als hulp. */
function WishPrice({ item }: { item: WishlistItem }): JSX.Element | null {
  const price = useCardPrice(item.tcgdex_id)
  if (!item.tcgdex_id) return null
  const market = marketValue(price, item.variant)
  if (price === undefined) return <span className="muted small">Market …</span>
  if (!market) return <span className="muted small">No market price</span>
  const under = item.max_price !== null && market.value <= item.max_price
  return <span className={under ? 'up small' : 'small'}>Market {formatEur(market.value)}{under ? ', within your max.' : ''}</span>
}

/** Cardmarket-knop naast een wens: productpagina als de kaart gekoppeld is, anders zoeken op naam en nummer. */
function WishCardmarket({ item }: { item: WishlistItem }): JSX.Element {
  const price = useCardPrice(item.tcgdex_id)
  return <CardmarketLink idProduct={price?.idProduct ?? null} searchText={[item.name, item.card_number].filter(Boolean).join(' ')} compact />
}

/** Prijsveld → bedrag of null (leeg of ongeldig = geen filter). */
const priceInput = (text: string): number | null => {
  if (text.trim() === '') return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

const matches = (item: WishlistItem, query: string): boolean =>
  matchesWords([item.name, item.set_code, item.card_number, item.card_number && `#${item.card_number}`, item.notes], query)

/** Wishlist: wat je zoekt, met wat je al hebt (of onderweg is) en de marktprijs. */
export function WishlistPage(): JSX.Element {
  const enabled = useWishlistEnabled()
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<WishFilters>(NO_WISH_FILTERS)
  const setFilter = (patch: Partial<WishFilters>): void => setFilters((f) => ({ ...f, ...patch }))
  const { language } = filters
  const wishKeys = useMemo(() => (items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : [])), [items])
  const infos = useCatalogInfos(wishKeys, needsWishCatalog(filters))
  const prices = useCardPrices(wishKeys, needsWishPrices(filters))
  // Slimme lijsten (STAP10): opgeslagen filters.
  const listsEnabled = useDbFeature(hasWishlistLists)
  const [lists, setLists] = useState<WishlistList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [listSheet, setListSheet] = useState<WishlistList | 'new' | null>(null)
  const [listNotice, setListNotice] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const activeList = lists.find((l) => l.id === activeListId) ?? null
  const [editing, setEditing] = useState<WishlistItem | 'new' | null>(null)
  // Startwaarden als je een kaart uit de kaartendatabase kiest.
  const [initial, setInitial] = useState<Partial<WishlistInput> | undefined>(undefined)

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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading the wishlist failed.')
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
        if (!cancelled) setListNotice(err instanceof Error ? err.message : 'Loading your lists failed.')
      })
    return () => {
      cancelled = true
    }
  }, [listsEnabled])

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
      setListNotice(err instanceof Error ? err.message : 'Saving the list failed.')
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
    return matches(r.item, query) && matchesWishFilters(r.item, filters, { found: r.found, market, info })
  })
  const foundCount = rows.filter((r) => r.found).length
  const wishedKeys = useMemo(() => new Set((items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : []))), [items])
  const ownedKeys = useMemo(() => new Set(cards.flatMap((c) => (c.tcgdex_id && c.ownership === 'owned' ? [c.tcgdex_id] : []))), [cards])
  // Bladeren in de kaartendatabase (zonder zoekterm) alleen buiten een opgeslagen lijst.
  const searching = activeList ? query.trim().length >= 2 : catalogActive(query, filters, filters.set.trim())
  const filterCount = activeWishFilterCount(filters)
  const listChanged = activeList !== null && !sameWishFilters(filters, activeList.filters)

  function openNew(start?: Partial<WishlistInput>): void {
    setInitial(start)
    setEditing('new')
  }

  async function pickFromCatalog(hit: CatalogHit, lang: Lang): Promise<void> {
    let setCode = hit.setId
    try {
      setCode = (await getSet(lang, hit.setId))?.summary.abbr ?? hit.setId
    } catch (err) {
      console.error('Setinfo ophalen mislukt', err)
    }
    openNew({
      tcgdex_id: `${lang}/${hit.card.id}`,
      name: hit.card.name,
      set_code: setCode.slice(0, 20),
      card_number: /^\d+$/.test(hit.card.localId) ? String(Number.parseInt(hit.card.localId, 10)) : hit.card.localId,
      language: language || null,
    })
  }

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
        <button type="button" className="primary" onClick={() => openNew()}>
          <IconPlus size={18} />
          Add card
        </button>
      </div>

      {(lists.length > 0 || listsEnabled === true) && (
        <div className="wish-lists">
          <div className="segmented" role="group" aria-label="Lists">
            <button type="button" aria-pressed={activeList === null} onClick={() => chooseList(null)}>
              All wishes
            </button>
            {lists.map((l) => (
              <button key={l.id} type="button" aria-pressed={activeList?.id === l.id} onClick={() => chooseList(l)} title={describeWishFilters(l.filters)}>
                {l.name}
              </button>
            ))}
          </div>
          {activeList && (
            <button type="button" className="ghost small-btn" onClick={() => setListSheet(activeList)}>
              Rename or remove
            </button>
          )}
        </div>
      )}

      <div className="filters">
        <div className="search">
          <IconSearch size={18} />
          <input
            type="search"
            placeholder="Search a Pokémon or card"
            aria-label="Search your wishlist and the card database"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select aria-label="Variant" value={filters.variant} onChange={(e) => setFilter({ variant: e.target.value as Variant | '' })}>
          <option value="">All variants</option>
          {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
            <option key={v} value={v}>
              {VARIANT_LABELS[v]}
            </option>
          ))}
        </select>
        <select aria-label="Language" value={filters.language} onChange={(e) => setFilter({ language: e.target.value as CardLanguage | '' })}>
          <option value="">All languages</option>
          {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
        <CatalogFilterFields value={filters} onChange={(next) => setFilter({ rarity: next.rarity, type: next.type, suffix: next.suffix })} compact />
      </div>

      <div className="filters wish-more">
        <label>
          Market from (€)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="any"
            value={filters.minPrice ?? ''}
            onChange={(e) => setFilter({ minPrice: priceInput(e.target.value) })}
          />
        </label>
        <label>
          Market to (€)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="any"
            value={filters.maxPrice ?? ''}
            onChange={(e) => setFilter({ maxPrice: priceInput(e.target.value) })}
          />
        </label>
        <label>
          Priority
          <select
            value={filters.priority ?? ''}
            onChange={(e) => {
              const p = Number(e.target.value)
              setFilter({ priority: p === 1 || p === 2 || p === 3 ? p : null })
            }}
          >
            <option value="">All</option>
            <option value="1">High</option>
            <option value="2">Normal</option>
            <option value="3">Low</option>
          </select>
        </label>
        <SetPicker value={filters.set.trim()} lang={lookupLang(language || null)} onChange={(set) => setFilter({ set })} />
        <label className="check">
          <input type="checkbox" checked={filters.underMax} onChange={(e) => setFilter({ underMax: e.target.checked })} />
          Within my max. price
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.showFound} onChange={(e) => setFilter({ showFound: e.target.checked })} />
          Show found
        </label>
        <div className="wish-list-actions">
          {listChanged && (
            <button type="button" className="primary small-btn" onClick={() => void updateActiveList()} disabled={listBusy}>
              Update “{activeList.name}”
            </button>
          )}
          {(filterCount > 0 || filters.showFound) && (listChanged || !activeList) && (
            <button type="button" className={listChanged ? 'small-btn' : 'primary small-btn'} onClick={saveAsList}>
              Save as new list
            </button>
          )}
          {(filterCount > 0 || query.trim() !== '') && !activeList && (
            <button
              type="button"
              className="small-btn"
              onClick={() => {
                setFilters(NO_WISH_FILTERS)
                setQuery('')
              }}
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>
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
        <p className="empty">Your wishlist is empty. Search for a Pokémon above, or add cards from a set's missing cards.</p>
      )}
      {items && items.length > 0 && visible.length === 0 && (
        <p className="empty">
          {searching ? 'None of your wishes match. Cards from the database are below.' : activeList ? 'No wishes in this list right now.' : 'No wishes match these filters.'}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="tx-list">
          {visible.map(({ item, owned, incoming, found }) => (
            <li key={item.id} className="wish-item">
              <button type="button" className="tx-row wish-row" onClick={() => setEditing(item)}>
                <span className="wish-thumb" aria-hidden="true">
                  <CardImage tcgdexId={item.tcgdex_id} kind="card" name={item.name} detail={item.card_number ? `#${item.card_number}` : null} />
                </span>
                <span className="tx-main">
                  <span className="tx-title">
                    {item.name}
                    {PRIORITY[item.priority] && <span className="chip">{PRIORITY[item.priority]}</span>}
                  </span>
                  <span className="muted small">
                    <CardSetSymbol tcgdexId={item.tcgdex_id} />
                    {[
                      [item.set_code, item.card_number && `#${item.card_number}`].filter(Boolean).join(' '),
                      item.variant ? VARIANT_LABELS[item.variant] : 'Any variant',
                      item.language ? LANGUAGE_LABELS[item.language] : null,
                      item.min_condition ? `${CONDITION_LABELS[item.min_condition]} or better` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  <WishPrice item={item} />
                </span>
                <span className="tx-amounts">
                  <span className={found ? 'up' : 'tx-amount'}>
                    {found ? 'Found' : `${owned} of ${item.wanted_qty}`}
                  </span>
                  {incoming > 0 && <span className="muted small">{incoming} incoming</span>}
                  {item.max_price !== null && <span className="muted small">max. {formatEur(item.max_price)}</span>}
                </span>
              </button>
              <WishCardmarket item={item} />
            </li>
          ))}
        </ul>
      )}

      {searching && (
        <CatalogResults
          filters={filters}
          setId={filters.set.trim()}
          query={query}
          lang={lookupLang(language || null)}
          wished={wishedKeys}
          owned={ownedKeys}
          onPick={(hit, lang) => void pickFromCatalog(hit, lang)}
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

      {listSheet && (
        <WishlistListSheet
          list={listSheet === 'new' ? null : listSheet}
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
          onSaved={(saved) => {
            setItems((list) => {
              const next = [...(list ?? [])]
              const i = next.findIndex((x) => x.id === saved.id)
              if (i >= 0) next[i] = saved
              else next.unshift(saved)
              return next
            })
            setEditing(null)
          }}
          onDeleted={(id) => {
            setItems((list) => list?.filter((x) => x.id !== id) ?? null)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
