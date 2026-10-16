import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardImage } from '../components/CardImage'
import { CatalogFilterFields } from '../components/CatalogFilterFields'
import { CatalogResults } from '../components/CatalogResults'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { IconPlus, IconSearch } from '../components/Icons'
import { WishlistDialog } from '../components/WishlistDialog'
import { useCardPrice } from '../hooks/useCardPrice'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import type { CatalogHit } from '../lib/catalogSearch'
import { matchesCatalog, needsCatalog, type CatalogFilters } from '../lib/collectionFilters'
import { listCards } from '../lib/db'
import { PRINTED_SETS, getSet, isLang, lookupLang, type Lang } from '../lib/tcgdex'
import { marketValue } from '../lib/prices'
import { matchesWords } from '../lib/search'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type Card, type CardLanguage, type Variant } from '../lib/types'
import { listWishlist, ownedForWish, type WishlistInput, type WishlistItem } from '../lib/wishlist'
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

const matches = (item: WishlistItem, query: string): boolean =>
  matchesWords([item.name, item.set_code, item.card_number, item.card_number && `#${item.card_number}`, item.notes], query)

/** Wishlist: wat je zoekt, met wat je al hebt (of onderweg is) en de marktprijs. */
export function WishlistPage(): JSX.Element {
  const enabled = useWishlistEnabled()
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [variant, setVariant] = useState<Variant | ''>('')
  const [language, setLanguage] = useState<CardLanguage | ''>('')
  const [showFound, setShowFound] = useState(false)
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilters>({ rarity: '', type: '', suffix: '' })
  const wishKeys = useMemo(() => (items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : [])), [items])
  const infos = useCatalogInfos(wishKeys, needsCatalog(catalogFilter))
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

  const rows = useMemo(
    () =>
      (items ?? []).map((item) => {
        const have = ownedForWish(item, cards)
        return { item, ...have, found: have.owned >= item.wanted_qty }
      }),
    [items, cards],
  )
  const visible = rows.filter(
    (r) =>
      (showFound || !r.found) &&
      (!variant || r.item.variant === variant) &&
      (!language || r.item.language === language) &&
      matches(r.item, query) &&
      // Catalogusfilters: tijdens laden niet wegfilteren; zonder koppeling past een wens niet.
      (!needsCatalog(catalogFilter) ||
        (r.item.tcgdex_id !== null && (!infos.has(r.item.tcgdex_id) || matchesCatalog(infos.get(r.item.tcgdex_id) ?? null, catalogFilter)))),
  )
  const foundCount = rows.filter((r) => r.found).length
  const wishedKeys = useMemo(() => new Set((items ?? []).flatMap((i) => (i.tcgdex_id ? [i.tcgdex_id] : []))), [items])
  const ownedKeys = useMemo(() => new Set(cards.flatMap((c) => (c.tcgdex_id && c.ownership === 'owned' ? [c.tcgdex_id] : []))), [cards])
  const searching = query.trim().length >= 2

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
        <select aria-label="Variant" value={variant} onChange={(e) => setVariant(e.target.value as Variant | '')}>
          <option value="">All variants</option>
          {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
            <option key={v} value={v}>
              {VARIANT_LABELS[v]}
            </option>
          ))}
        </select>
        <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage | '')}>
          <option value="">All languages</option>
          {(Object.keys(LANGUAGE_LABELS) as CardLanguage[]).map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
        <CatalogFilterFields value={catalogFilter} onChange={setCatalogFilter} compact />
        <label className="check">
          <input type="checkbox" checked={showFound} onChange={(e) => setShowFound(e.target.checked)} />
          Show found
        </label>
      </div>

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
        <p className="empty">{searching ? 'None of your wishes match. Cards from the database are below.' : 'No wishes match these filters.'}</p>
      )}

      {visible.length > 0 && (
        <ul className="tx-list">
          {visible.map(({ item, owned, incoming, found }) => (
            <li key={item.id}>
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
            </li>
          ))}
        </ul>
      )}

      {searching && (
        <CatalogResults
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
