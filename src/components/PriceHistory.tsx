import { useEffect, useMemo, useState, type JSX } from 'react'
import { listSnapshots, type PriceSnapshot } from '../lib/db'
import { marketValue } from '../lib/prices'
import { LineChart, type Point } from './LineChart'
import { formatEur } from '../lib/stats'
import { cardmarketUrl, getCardPrice, type CardmarketPrice } from '../lib/tcgdex'
import type { Variant } from '../lib/types'

interface Props {
  tcgdexId: string
  variant: Variant | null
  /** Zoektekst voor Cardmarket als het product-id onbekend is. */
  searchText: string
}

function CardmarketLink({ idProduct, searchText }: { idProduct: number | null; searchText: string }): JSX.Element {
  return (
    <a className="external-link" href={cardmarketUrl(idProduct, searchText)} target="_blank" rel="noopener noreferrer">
      {idProduct ? 'Bekijk op Cardmarket' : 'Zoek op Cardmarket'}
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <path d="M6 3h7v7M13 3 5.5 10.5M11 9.5V13H3V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden"> (opent in nieuw tabblad)</span>
    </a>
  )
}

/** Actuele Cardmarket-prijs plus dagelijks opgebouwd prijsverloop. */
export function PriceHistory({ tcgdexId, variant, searchText }: Props): JSX.Element {
  const [price, setPrice] = useState<{ key: string; value: CardmarketPrice | null } | null>(null)
  const [history, setHistory] = useState<{ key: string; rows: PriceSnapshot[] } | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCardPrice(tcgdexId)
      .then((value) => {
        if (!cancelled) setPrice({ key: tcgdexId, value })
      })
      .catch((err: unknown) => {
        console.error('Prijs ophalen mislukt', err)
        if (!cancelled) setPrice({ key: tcgdexId, value: null })
      })
    listSnapshots(tcgdexId)
      .then((rows) => {
        if (!cancelled) setHistory({ key: tcgdexId, rows })
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setHistoryError('Prijsverloop is (nog) niet beschikbaar.')
      })
    return () => {
      cancelled = true
    }
  }, [tcgdexId])

  const reverse = variant === 'reverse'
  const current = price?.key === tcgdexId ? price.value : undefined
  const mv = marketValue(current, variant)
  const points = useMemo<Point[]>(() => {
    if (!history || history.key !== tcgdexId) return []
    return history.rows.flatMap((r) => {
      const v = reverse ? r.trendHolo : r.trend
      return v === null ? [] : [{ date: r.takenOn, value: v }]
    })
  }, [history, tcgdexId, reverse])

  if (current === undefined) return <p className="muted" aria-live="polite">Marktprijs laden…</p>

  const avg = (normal: number | null, holo: number | null): string => {
    const v = reverse ? holo : normal
    return v === null ? 'onbekend' : formatEur(v)
  }

  return (
    <div className="price-history">
      {mv ? (
        <p>
          <span className="stat-label">Marktwaarde{reverse ? ' (reverse holo)' : ''}</span>
          <br />
          <span className="stat-value">{formatEur(mv.value)}</span>{' '}
          <span className="muted small">
            {mv.basis === 'trend' ? 'Cardmarket-trend' : mv.basis === 'avg30' ? 'gemiddelde 30 dagen' : 'gemiddelde 7 dagen'}
          </span>
        </p>
      ) : (
        <p className="muted">Geen Cardmarket-prijs bekend{reverse ? ' voor reverse holo' : ''}.</p>
      )}
      <CardmarketLink idProduct={current?.idProduct ?? null} searchText={searchText} />

      {current && (
        <dl className="price-facts">
          <div><dt>Laagste aanbod</dt><dd>{avg(current.low, current.lowHolo)}</dd></div>
          <div><dt>Gem. 1 dag</dt><dd>{avg(current.avg1, current.avg1Holo)}</dd></div>
          <div><dt>Gem. 7 dagen</dt><dd>{avg(current.avg7, current.avg7Holo)}</dd></div>
          <div><dt>Gem. 30 dagen</dt><dd>{avg(current.avg30, current.avg30Holo)}</dd></div>
        </dl>
      )}

      {points.length >= 2 ? (
        <LineChart points={points} label={`Prijsverloop${reverse ? ' reverse holo' : ''}`} />
      ) : (
        <p className="muted small">
          {historyError ?? 'Het prijsverloop wordt vanaf nu dagelijks opgeslagen; na een paar dagen verschijnt hier een grafiek.'}
        </p>
      )}
    </div>
  )
}
