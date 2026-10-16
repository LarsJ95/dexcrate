import { useEffect, useMemo, useState, type JSX } from 'react'
import { rarityRule } from '../lib/cardTraits'
import { summarizeCrate, type CrateCard } from '../lib/crate'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice } from '../lib/tcgdex'
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

interface Props {
  cards: readonly CrateCard[]
  onOpen: (card: CrateCard) => void
}

/** Overzicht van je Crate: totalen, per zeldzaamheid en een sorteerbare tabel met Cardmarket-prijzen. */
export function CrateOverview({ cards, onOpen }: Props): JSX.Element {
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

  const summary = useMemo(() => summarizeCrate(cards, (id) => prices.get(id)), [cards, prices])
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

  if (cards.length === 0) return <p className="empty">No virtual cards yet. Open your first pack above.</p>

  return (
    <div className="crate-overview">
      <div className="crate-stats">
        <div className="panel">
          <span className="stat-label">Cards</span>
          <strong>{summary.unique}</strong>
          <span className="muted small">{summary.copies} in total</span>
        </div>
        <div className="panel">
          <span className="stat-label">Market value</span>
          <strong>{formatEur(summary.value)}</strong>
          <span className="muted small">{loaded < cards.length ? `Loading prices ${loaded}/${cards.length}…` : `${summary.priced} of ${summary.unique} cards have a price`}</span>
        </div>
        <div className="panel">
          <span className="stat-label">Duplicates</span>
          <strong>{formatEur(summary.duplicateValue)}</strong>
          <span className="muted small">or {summary.duplicatePoints} points when traded in</span>
        </div>
        <div className="panel">
          <span className="stat-label">Most valuable</span>
          {summary.top ? (
            <>
              <button type="button" className="link-button" onClick={() => summary.top && onOpen(summary.top.card)}>
                {summary.top.card.name}
              </button>
              <span className="muted small">{formatEur(summary.top.value)}</span>
            </>
          ) : (
            <span className="muted small">{loaded < cards.length ? 'Loading…' : 'No prices'}</span>
          )}
        </div>
      </div>

      <section className="panel" aria-labelledby="crate-rarity-title">
        <h3 id="crate-rarity-title" className="section-title">
          By rarity
        </h3>
        <div className="crate-table-wrap">
          <table className="crate-table">
            <thead>
              <tr>
                <th scope="col">Rarity</th>
                <th scope="col" className="num">Cards</th>
                <th scope="col" className="num">Copies</th>
                <th scope="col" className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {summary.byRarity.map((g) => (
                <tr key={g.rarity}>
                  <td>
                    <RaritySymbols rarity={g.rarity} /> {g.rarity}
                  </td>
                  <td className="num">{g.unique}</td>
                  <td className="num">{g.copies}</td>
                  <td className="num">{formatEur(g.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="crate-all-title">
        <h3 id="crate-all-title" className="section-title">
          All cards
        </h3>
        <div className="crate-table-wrap">
          <table className="crate-table">
            <thead>
              <tr>
                {COLS.map(([col, label]) => (
                  <th
                    key={col}
                    scope="col"
                    className={col === 'qty' || col === 'price' || col === 'value' ? 'num' : undefined}
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
                return (
                  <tr key={c.tcgdexId}>
                    <td>
                      <button type="button" className="link-button" onClick={() => onOpen(c)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.setName ?? '–'}</td>
                    <td>
                      <RaritySymbols rarity={c.rarity} /> <span className="hide-narrow">{c.rarity ?? '–'}</span>
                    </td>
                    <td className="num">{c.quantity}</td>
                    <td className="num">{p === undefined ? '…' : p === null ? '–' : formatEur(p)}</td>
                    <td className="num">{p === undefined ? '…' : p === null ? '–' : formatEur(p * c.quantity)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
