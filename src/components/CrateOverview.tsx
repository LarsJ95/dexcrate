import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { foilStyleFor, rarityRule } from '../lib/cardTraits'
import { crateSetProgress, summarizeCrate, type CrateCard } from '../lib/crate'
import { crateSetKey } from '../lib/crateFilters'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, getSetList } from '../lib/tcgdex'
import { hpLevel } from '../lib/trainer'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { HoloCard } from './HoloCard'
import { RaritySymbols } from './RaritySymbols'

type Col = 'name' | 'set' | 'rarity' | 'qty' | 'price' | 'value'

const COLS: [Col, string][] = [
  ['name', 'Card'],
  ['set', 'Set'],
  ['rarity', 'Rarity'],
  ['qty', 'Qty'],
  ['price', 'Price'],
  ['value', 'Value'],
]

/** Getallen rechts; op de telefoon alleen kaart en waarde als kolom (set, zeldzaamheid en aantal staan eronder). */
function colClass(col: Col): string | undefined {
  const cls = [col === 'qty' || col === 'price' || col === 'value' ? 'num' : null, col === 'name' || col === 'value' ? null : 'hide-narrow'].filter(Boolean)
  return cls.length > 0 ? cls.join(' ') : undefined
}

interface Props {
  cards: readonly CrateCard[]
  onOpen: (card: CrateCard) => void
  /** Inruilfactor uit de regels (STAP18: 2). */
  tradeFactor: number
  /** Knop (met bevestigen) om alle dubbelen in te ruilen; null = geen dubbelen. */
  tradeAll: ReactNode
}

/** Zoveel waardevolste kaarten en sets tonen; de rest via de tabel / "Show all sets". */
const TOP_CARDS = 6
const TOP_SETS = 6

/**
 * Overzicht van je Crate (standaardweergave, rustiger sinds 18-10-2026): één statistiekbalk, je waardevolste kaarten,
 * setvoortgang (doel van het Set pack), zeldzaamheid als balkjes en de volledige tabel ingeklapt.
 */
export function CrateOverview({ cards, onOpen, tradeFactor, tradeAll }: Props): JSX.Element {
  // Prijs per exemplaar; ontbreekt zolang hij laadt, null = geen prijs.
  const [prices, setPrices] = useState<ReadonlyMap<string, number | null>>(new Map())
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'value', desc: true })

  const ids = useMemo(() => [...new Set(cards.map((c) => c.tcgdexId))].sort().join('|'), [cards])
  useEffect(() => {
    if (!ids) return
    let cancelled = false
    const found = new Map<string, number | null>()
    let flush = 0
    const publish = (): void => {
      flush = 0
      if (!cancelled) setPrices(new Map(found))
    }
    // Prijzen komen één voor één binnen; samen tonen om niet bij elke prijs de hele tabel te tekenen.
    for (const id of ids.split('|')) {
      getCardPrice(id)
        .then((p) => found.set(id, marketValue(p, null)?.value ?? null))
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${id}`, err)
          found.set(id, null)
        })
        .finally(() => {
          if (!flush) flush = window.setTimeout(publish, 300)
        })
    }
    return () => {
      cancelled = true
      window.clearTimeout(flush)
    }
  }, [ids])

  const summary = useMemo(() => summarizeCrate(cards, (id) => prices.get(id), tradeFactor), [cards, prices, tradeFactor])
  const loaded = cards.filter((c) => prices.has(c.tcgdexId)).length

  const rows = useMemo(() => {
    const priceOf = (c: CrateCard): number => prices.get(c.tcgdexId) ?? -1
    const cmp: Record<Col, (a: CrateCard, b: CrateCard) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'en'),
      set: (a, b) => (a.setName ?? '').localeCompare(b.setName ?? '', 'en'),
      rarity: (a, b) => rarityRule(a.rarity).rank - rarityRule(b.rarity).rank,
      qty: (a, b) => a.quantity - b.quantity,
      price: (a, b) => priceOf(a) - priceOf(b),
      value: (a, b) => priceOf(a) * a.quantity - priceOf(b) * b.quantity,
    }
    const dir = sort.desc ? -1 : 1
    return [...cards].sort((a, b) => dir * cmp[sort.col](a, b) || a.name.localeCompare(b.name, 'en'))
  }, [cards, prices, sort])

  // Officiële grootte per set (voor de setvoortgang); de Engelse setlijst is gedeeld en gecachet.
  const [official, setOfficial] = useState<ReadonlyMap<string, number>>(new Map())
  useEffect(() => {
    let cancelled = false
    getSetList('en')
      .then((list) => {
        if (!cancelled) setOfficial(new Map([...list.values()].flatMap((s) => (s.official ? [[`en/${s.id}`, s.official] as const] : []))))
      })
      .catch((err: unknown) => console.warn('Setlijst ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [])
  const [allSets, setAllSets] = useState(false)

  const sets = useMemo(() => {
    const names = new Map<string, string>()
    for (const c of cards) {
      const key = crateSetKey(c)
      if (key && !names.has(key)) names.set(key, c.setName ?? key)
    }
    return [...names]
      .flatMap(([key, name]) => {
        const total = official.get(key)
        return total ? [{ key, name, have: crateSetProgress(cards, key, total), total }] : []
      })
      .sort((a, b) => b.have / b.total - a.have / a.total || b.have - a.have)
  }, [cards, official])

  const top = useMemo(
    () =>
      [...cards]
        .filter((c) => (prices.get(c.tcgdexId) ?? null) !== null)
        .sort((a, b) => (prices.get(b.tcgdexId) ?? 0) - (prices.get(a.tcgdexId) ?? 0))
        .slice(0, TOP_CARDS),
    [cards, prices],
  )
  const maxRarity = Math.max(1, ...summary.byRarity.map((g) => g.unique))

  if (cards.length === 0) return <p className="empty">No virtual cards yet. Open your first pack above.</p>

  return (
    <div className="crate-overview">
      <section className="panel crate-ov-stats" aria-label="Your Crate in numbers">
        <div>
          <span className="stat-label">Cards</span>
          <strong>{summary.unique}</strong>
          <span className="muted small">{summary.copies} copies</span>
        </div>
        <div className="crate-ov-value">
          <span className="stat-label">Market value</span>
          <strong>{formatEur(summary.value)}</strong>
          <span className="muted small">{loaded < cards.length ? `Loading prices ${loaded}/${cards.length}…` : `${summary.priced} of ${summary.unique} with a price`}</span>
        </div>
        <div>
          <span className="stat-label">Duplicates</span>
          <strong>{summary.duplicatePoints} pts</strong>
          <span className="muted small">worth {formatEur(summary.duplicateValue)}</span>
        </div>
        {tradeAll && <div className="crate-ov-trade">{tradeAll}</div>}
      </section>

      {top.length > 0 && (
        <section className="crate-ov-section" aria-labelledby="crate-top-title">
          <h3 id="crate-top-title" className="section-title">
            Most valuable
          </h3>
          <ul className="crate-ov-top">
            {top.map((c) => (
              <li key={c.tcgdexId}>
                <button type="button" className="crate-ov-card" onClick={() => onOpen(c)} aria-label={`${c.name}, ${formatEur(prices.get(c.tcgdexId) ?? 0)}. Show details`}>
                  <HoloCard foil={foilStyleFor(null, c.rarity)}>
                    <CatalogKeyPicture cardKey={c.tcgdexId} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={c.setName} />} />
                  </HoloCard>
                </button>
                <span className="small crate-ov-name">{c.name}</span>
                <strong className="small">{formatEur(prices.get(c.tcgdexId) ?? 0)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="crate-ov-columns">
        {sets.length > 0 && (
          <section className="panel crate-ov-section" aria-labelledby="crate-sets-title">
            <h3 id="crate-sets-title" className="section-title">
              Sets
            </h3>
            <ul className="crate-ov-bars">
              {(allSets ? sets : sets.slice(0, TOP_SETS)).map((s) => (
                <li key={s.key}>
                  <span className="crate-ov-bar-label">{s.name}</span>
                  <span className="muted small crate-ov-bar-count">
                    {s.have}/{s.total}
                  </span>
                  <span className="meter" aria-hidden="true">
                    <span className="meter-fill" data-hp={hpLevel(s.have / s.total)} style={{ width: `${(s.have / s.total) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            {sets.length > TOP_SETS && (
              <button type="button" className="small-btn" onClick={() => setAllSets((v) => !v)}>
                {allSets ? 'Show fewer sets' : `Show all ${sets.length} sets`}
              </button>
            )}
          </section>
        )}

        <section className="panel crate-ov-section" aria-labelledby="crate-rarity-title">
          <h3 id="crate-rarity-title" className="section-title">
            By rarity
          </h3>
          <ul className="crate-ov-bars">
            {summary.byRarity.map((g) => (
              <li key={g.rarity}>
                <span className="crate-ov-bar-label">
                  <RaritySymbols rarity={g.rarity} /> {g.rarity}
                </span>
                <span className="muted small crate-ov-bar-count">
                  {g.unique} · {formatEur(g.value)}
                </span>
                <span className="meter" aria-hidden="true">
                  <span className="meter-fill" style={{ width: `${(g.unique / maxRarity) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="panel crate-ov-all">
        <summary>
          <span className="section-title">All cards</span>
          <span className="muted small">{cards.length} cards, sortable by price and value</span>
        </summary>
        {/* Telefoon: alleen kaart en waarde als kolom; sorteren op de rest via deze lijst. */}
        <select className="crate-table-sort" aria-label="Sort" value={sort.col} onChange={(e) => setSort({ col: e.target.value as Col, desc: e.target.value !== 'name' && e.target.value !== 'set' })}>
          {COLS.map(([col, label]) => (
            <option key={col} value={col}>
              {label}
              {sort.col === col ? (sort.desc ? ' ↓' : ' ↑') : ''}
            </option>
          ))}
        </select>
        <div className="crate-table-wrap">
          <table className="crate-table">
            <thead>
              <tr>
                {COLS.map(([col, label]) => (
                  <th
                    key={col}
                    scope="col"
                    className={colClass(col)}
                    aria-sort={sort.col === col ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                  >
                    <button
                      type="button"
                      className="th-sort"
                      onClick={() => setSort((s) => ({ col, desc: s.col === col ? !s.desc : col !== 'name' && col !== 'set' }))}
                    >
                      {label}
                      <span aria-hidden="true">{sort.col === col ? (sort.desc ? ' ↓' : ' ↑') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const p = prices.get(c.tcgdexId)
                const each = p === undefined ? '…' : p === null ? '–' : formatEur(p)
                return (
                  <tr key={c.tcgdexId}>
                    <td>
                      <button type="button" className="crate-table-name" onClick={() => onOpen(c)}>
                        {c.name}
                      </button>
                      <span className="crate-table-sub muted small">
                        <RaritySymbols rarity={c.rarity} /> {c.setName ?? '–'}
                      </span>
                    </td>
                    <td className="hide-narrow">{c.setName ?? '–'}</td>
                    <td className="hide-narrow">
                      <RaritySymbols rarity={c.rarity} /> {c.rarity ?? '–'}
                    </td>
                    <td className="num hide-narrow">{c.quantity}</td>
                    <td className="num hide-narrow">{each}</td>
                    <td className="num">
                      {p === undefined ? '…' : p === null ? '–' : formatEur(p * c.quantity)}
                      {c.quantity > 1 && (
                        <span className="crate-table-sub muted small">
                          {c.quantity} × {each}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
