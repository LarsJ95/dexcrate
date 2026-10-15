import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { CardDialog } from '../components/CardDialog'
import { CardTile } from '../components/CardTile'
import { listCards, updateCard } from '../lib/db'
import { formatEur } from '../lib/stats'
import { STATUS_LABELS, type Card, type CardStatus } from '../lib/types'

type StatusFilter = 'all' | 'owned' | CardStatus
type SortKey = 'list' | 'priceDesc' | 'priceAsc' | 'name' | 'set'

const FILTERS: [StatusFilter, string][] = [
  ['owned', 'In bezit'],
  ['collection', STATUS_LABELS.collection],
  ['for_sale', STATUS_LABELS.for_sale],
  ['sold', STATUS_LABELS.sold],
  ['all', 'Alles'],
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

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((rows) => {
        if (!cancelled) setCards(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Laden mislukt.')
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
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    if (sort === 'set') {
      sorted.sort(
        (a, b) =>
          (a.set_code ?? '').localeCompare(b.set_code ?? '', 'nl') ||
          (Number.parseInt(a.card_number ?? '', 10) || 0) - (Number.parseInt(b.card_number ?? '', 10) || 0),
      )
    }
    return sorted
  }, [cards, query, filter, sort])

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
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
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
        setActionError(err instanceof Error ? err.message : 'Bijwerken mislukt.')
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

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>Collectie</h1>
          {cards && (
            <p className="muted">
              {visibleCount} {visibleCount === 1 ? 'stuk' : 'stuks'}
              {filter !== 'collection' && filter !== 'owned' && <>, samen {formatEur(visibleValue)}</>}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setEditing({ id: null })}>
          Kaart toevoegen
        </button>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="Zoek op naam, set, nummer of kanaal"
          aria-label="Zoeken"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Status">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <select aria-label="Sorteren" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="list">Volgorde van invoer</option>
          <option value="set">Set en nummer</option>
          <option value="priceDesc">Prijs hoog–laag</option>
          <option value="priceAsc">Prijs laag–hoog</option>
          <option value="name">Naam A–Z</option>
        </select>
      </div>

      {unlinked > 0 && (
        <p className="notice">
          {unlinked} {unlinked === 1 ? 'kaart is' : 'kaarten zijn'} nog niet gekoppeld. Open een kaart en kies de juiste
          versie voor foto en marktprijs.
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
            Opnieuw proberen
          </button>
        </div>
      )}
      {!cards && !loadError && <p aria-live="polite">Laden…</p>}
      {cards && cards.length === 0 && (
        <p className="empty">
          Je collectie is nog leeg. Voeg een kaart toe of <a href="#/import">importeer je Excel</a>.
        </p>
      )}
      {cards && cards.length > 0 && visible.length === 0 && <p className="empty">Geen kaarten voor deze filters.</p>}

      <ul className="binder">
        {visible.map((c) => (
          <CardTile key={c.id} card={c} onOpen={open} onToggleSold={onToggle} busy={pending.has(c.id)} />
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
