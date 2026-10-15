import { describe, expect, it } from 'vitest'
import { realizedSummary, saleResult, splitEvenly, unitCost, type CostCard } from './results'
import type { Transaction, TxLine } from './transactionTypes'

let n = 0
const line = (card_id: string | null, quantity: number, unit_amount: number | null = null): TxLine => ({
  id: `l${++n}`,
  card_id,
  quantity,
  unit_amount,
})

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  kind: 'sale',
  occurred_on: '2026-10-15',
  channel: null,
  counterparty: null,
  amount: null,
  shipping_amount: null,
  fees_amount: null,
  shipping_cost: null,
  refund_amount: null,
  status: 'completed',
  notes: null,
  created_at: '',
  lines: [],
  ...patch,
})

const cards = (list: CostCard[]): Map<string, CostCard> => new Map(list.map((c) => [c.id, c]))

describe('saleResult', () => {
  const owned = cards([
    { id: 'a', purchase_price: 2, split_from: null },
    { id: 'b', purchase_price: 3, split_from: null },
  ])

  it('lotverkoop telt opbrengst en kosten één keer, niet per kaart', () => {
    const lot = tx({
      amount: 20,
      shipping_amount: 1.5,
      fees_amount: 1,
      shipping_cost: 2,
      lines: [line('a', 2), line('b', 1)], // geen bedrag per kaart: alleen lotprijs bekend
    })
    const r = saleResult(lot, owned, [])
    expect(r.revenue).toBe(21.5)
    expect(r.costs).toBe(3)
    expect(r.costBasis).toBe(7) // 2×2 + 1×3
    expect(r.result).toBe(11.5)
    expect(r.missing).toEqual([])
  })

  it('onbekende kosten of kostprijs: geen definitief resultaat', () => {
    const r = saleResult(tx({ amount: 10, shipping_amount: 0, lines: [line('a', 1)] }), owned, [])
    expect(r.result).toBeNull()
    expect(r.missing).toEqual(['fees', 'shipping cost'])

    const unknownCost = cards([{ id: 'x', purchase_price: null, split_from: null }])
    const r2 = saleResult(tx({ amount: 10, shipping_amount: 0, fees_amount: 0, shipping_cost: 0, lines: [line('x', 2)] }), unknownCost, [])
    expect(r2.costBasis).toBeNull()
    expect(r2.result).toBeNull()
    expect(r2.missing).toEqual(['purchase cost of 2 cards'])
  })

  it('geannuleerd of retour telt niet mee', () => {
    const r = saleResult(tx({ status: 'returned', amount: 10, shipping_amount: 0, fees_amount: 0, shipping_cost: 0 }), owned, [])
    expect(r.excluded).toBe(true)
    expect(r.result).toBeNull()
  })

  it('gedeeltelijke terugbetaling gaat van de opbrengst af', () => {
    const r = saleResult(
      tx({ amount: 10, shipping_amount: 0, fees_amount: 0, shipping_cost: 0, refund_amount: 4, lines: [line('a', 1)] }),
      owned,
      [],
    )
    expect(r.revenue).toBe(6)
    expect(r.result).toBe(4)
  })
})

describe('unitCost', () => {
  it('verdeelt verzend- en overige kosten van de aankoop over de stuks', () => {
    const c = cards([
      { id: 'a', purchase_price: 2, split_from: null },
      { id: 'b', purchase_price: 4, split_from: null },
    ])
    const purchase = tx({ kind: 'purchase', amount: 10, shipping_amount: 3, fees_amount: 1, lines: [line('a', 3), line('b', 1)] })
    // (3 + 1) / 4 stuks = 1 per stuk erbij
    expect(unitCost('a', c, [purchase])).toBe(3)
    expect(unitCost('b', c, [purchase])).toBe(5)
  })

  it('gesplitste regel gebruikt de aankoop van de oorspronkelijke regel', () => {
    const c = cards([
      { id: 'orig', purchase_price: 2, split_from: null },
      { id: 'sold-part', purchase_price: 2, split_from: 'orig' },
    ])
    const purchase = tx({ kind: 'purchase', amount: 6, shipping_amount: 1.5, fees_amount: 0, lines: [line('orig', 3)] })
    expect(unitCost('sold-part', c, [purchase])).toBe(2.5)
  })

  it('aankoop met onbekende verzendkosten: kostprijs onbekend', () => {
    const c = cards([{ id: 'a', purchase_price: 2, split_from: null }])
    expect(unitCost('a', c, [tx({ kind: 'purchase', amount: 2, lines: [line('a', 1)] })])).toBeNull()
  })
})

describe('realizedSummary', () => {
  it('telt alleen volledige verkopen op; onvolledige en in behandeling apart', () => {
    const c = cards([{ id: 'a', purchase_price: 1, split_from: null }])
    const full = { shipping_amount: 0, fees_amount: 0, shipping_cost: 0 }
    const s = realizedSummary(
      [
        tx({ amount: 5, ...full, lines: [line('a', 1)] }), // +4
        tx({ amount: 9, lines: [line('a', 1)] }), // onvolledig
        tx({ amount: 7, ...full, status: 'shipped', lines: [line('a', 1)] }), // +6, in behandeling
        tx({ amount: 100, ...full, status: 'cancelled', lines: [line('a', 1)] }), // telt niet
      ],
      c,
    )
    expect(s).toEqual({ result: 10, complete: 2, incomplete: 1, pending: 1 })
  })
})

describe('splitEvenly', () => {
  it('verdeelt op de cent', () => {
    expect(splitEvenly(10, [1, 1, 1, 1])).toEqual([2.5, 2.5, 2.5, 2.5])
    const parts = splitEvenly(10, [1, 1, 1])
    expect(parts.reduce((a, b) => a + Math.round(b * 100), 0)).toBe(1000)
  })

  it('bij meerdere stuks per regel kan een restcent overblijven; nooit meer dan het totaal', () => {
    const parts = splitEvenly(10, [3])
    expect(parts).toEqual([3.33])
    expect(Math.round(parts[0] * 3 * 100)).toBeLessThanOrEqual(1000)
  })
})
