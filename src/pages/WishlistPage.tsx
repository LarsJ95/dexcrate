import { useEffect, useMemo, useState, type JSX } from 'react'
import { CardImage } from '../components/CardImage'
import { IconPlus, IconSearch } from '../components/Icons'
import { WishlistDialog } from '../components/WishlistDialog'
import { useCardPrice } from '../hooks/useCardPrice'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { listCards } from '../lib/db'
import { marketValue } from '../lib/prices'
import { matchesWords } from '../lib/search'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, LANGUAGE_LABELS, VARIANT_LABELS, type Card, type CardLanguage, type Variant } from '../lib/types'
import { listWishlist, ownedForWish, type WishlistItem } from '../lib/wishlist'

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
  const [editing, setEditing] = useState<WishlistItem | 'new' | null>(null)

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
      matches(r.item, query),
  )
  const foundCount = rows.filter((r) => r.found).length

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
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          <IconPlus size={18} />
          Add card
        </button>
      </div>

      <div className="filters">
        <div className="search">
          <IconSearch size={18} />
          <input type="search" placeholder="Search name, set or number" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
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
      {items === null && !error && <p aria-live="polite">Loading…</p>}
      {items?.length === 0 && <p className="empty">Your wishlist is empty. Add cards here, or from a set's missing cards.</p>}
      {items && items.length > 0 && visible.length === 0 && <p className="empty">No wishes match these filters.</p>}

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

      {editing && (
        <WishlistDialog
          item={editing === 'new' ? null : editing}
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
