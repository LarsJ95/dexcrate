import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { CardTile } from '../components/CardTile'
import { ItemDialog } from '../components/ItemDialog'
import { listItems, updateItem, type Row, type Table } from '../lib/db'
import { formatEur } from '../lib/stats'

type StatusFilter = 'all' | 'forSale' | 'sold'
type SortKey = 'list' | 'priceDesc' | 'priceAsc' | 'name'

interface Props<T extends Table> {
  table: T
}

const DEFAULT_CHANNELS = ['Cardmarket', 'WhatsApp', 'Bol.com', 'CatchYourCards']

function lineCents(r: Row<Table>): number {
  return r.quantity * Math.round(r.unit_price * 100)
}

export function ItemsPage<T extends Table>({ table }: Props<T>): JSX.Element {
  const isSales = table === 'sales'
  const [items, setItems] = useState<Row<T>[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('list')
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    listItems(table)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Laden mislukt.')
      })
    return () => {
      cancelled = true
    }
  }, [table, reloadKey])

  function retry(): void {
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }

  const visible = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    const filtered = items.filter((it) => {
      if (isSales && 'sold' in it) {
        if (status === 'sold' && !it.sold) return false
        if (status === 'forSale' && it.sold) return false
      }
      if (!q) return true
      return [it.name, it.set_code, it.card_number, it.channel].some((v) => v?.toLowerCase().includes(q))
    })
    const sorted = [...filtered]
    if (sort === 'priceDesc') sorted.sort((a, b) => b.unit_price - a.unit_price)
    if (sort === 'priceAsc') sorted.sort((a, b) => a.unit_price - b.unit_price)
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
    return sorted
  }, [items, query, status, sort, isSales])

  const summary = useMemo(() => {
    let cents = 0
    let count = 0
    for (const it of visible) {
      cents += lineCents(it)
      count += it.quantity
    }
    return { amount: cents / 100, count }
  }, [visible])

  const channels = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    for (const it of items ?? []) if (it.channel) set.add(it.channel)
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  const unlinked = useMemo(() => (items ?? []).filter((i) => i.kind === 'card' && !i.tcgdex_id).length, [items])

  const toggleSold = useCallback(
    async (id: string): Promise<void> => {
      const current = items?.find((i) => i.id === id)
      if (!current || !('sold' in current) || pending.has(id)) return
      const next = !current.sold
      setActionError(null)
      setPending((p) => new Set(p).add(id))
      // Optimistisch bijwerken; bij een fout terugzetten.
      setItems((list) => list?.map((i) => (i.id === id ? { ...i, sold: next } : i)) ?? null)
      try {
        await updateItem('sales', id, { sold: next })
      } catch (err) {
        setItems((list) => list?.map((i) => (i.id === id ? { ...i, sold: !next } : i)) ?? null)
        setActionError(err instanceof Error ? err.message : 'Bijwerken mislukt.')
      } finally {
        setPending((p) => {
          const n = new Set(p)
          n.delete(id)
          return n
        })
      }
    },
    [items, pending],
  )

  const open = useCallback((id: string) => setEditing({ id }), [])
  const onToggle = useCallback((id: string) => void toggleSold(id), [toggleSold])

  const editingItem = editing?.id ? (items?.find((i) => i.id === editing.id) ?? null) : null
  const nextSortOrder = (items ?? []).reduce((m, i) => Math.max(m, i.sort_order), -1) + 1

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>{isSales ? 'Verkoop' : 'Aankopen'}</h1>
          {items && (
            <p className="muted">
              {summary.count} {summary.count === 1 ? 'stuk' : 'stuks'}, samen {formatEur(summary.amount)}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setEditing({ id: null })}>
          {isSales ? 'Kaart toevoegen' : 'Aankoop toevoegen'}
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
        {isSales && (
          <div className="segmented" role="group" aria-label="Status">
            {(
              [
                ['all', 'Alles'],
                ['forSale', 'Te koop'],
                ['sold', 'Verkocht'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <select aria-label="Sorteren" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="list">Volgorde van de lijst</option>
          <option value="priceDesc">Prijs hoog–laag</option>
          <option value="priceAsc">Prijs laag–hoog</option>
          <option value="name">Naam A–Z</option>
        </select>
      </div>

      {unlinked > 0 && (
        <p className="notice">
          {unlinked} {unlinked === 1 ? 'kaart is' : 'kaarten zijn'} nog niet gekoppeld. Open een kaart en kies
          de juiste versie voor foto en marktprijs.
        </p>
      )}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {loadError && (
        <div className="notice" role="alert">
          <p className="error">{loadError}</p>
          <button type="button" onClick={retry}>Opnieuw proberen</button>
        </div>
      )}
      {!items && !loadError && <p aria-live="polite">Laden…</p>}
      {items && items.length === 0 && (
        <p className="empty">Nog niets in deze lijst. Voeg een kaart toe of importeer je Excel.</p>
      )}
      {items && items.length > 0 && visible.length === 0 && <p className="empty">Geen resultaten voor deze filters.</p>}

      <ul className="binder">
        {visible.map((it) => (
          <CardTile
            key={it.id}
            item={it}
            onOpen={open}
            onToggleSold={isSales ? onToggle : undefined}
            busy={pending.has(it.id)}
          />
        ))}
      </ul>

      {editing && (
        <ItemDialog
          key={editing.id ?? 'new'}
          table={table}
          item={editingItem}
          channels={channels}
          nextSortOrder={nextSortOrder}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setItems((list) => {
              if (!list) return [row]
              return list.some((i) => i.id === row.id) ? list.map((i) => (i.id === row.id ? row : i)) : [...list, row]
            })
            setEditing(null)
          }}
          onDeleted={(id) => {
            setItems((list) => list?.filter((i) => i.id !== id) ?? null)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
