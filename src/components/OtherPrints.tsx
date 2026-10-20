import { useEffect, useState, type JSX } from 'react'
import { getOtherPrints, type OtherPrint } from '../lib/prints'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { CardZoom } from './CardZoom'

/**
 * Andere prints van deze kaart (herdrukken in andere sets). Tikken op een print toont hem groot (gebruiker
 * 20-10-2026: eerst ging dat naar de hele set); "Open set" eronder gaat naar de set. Laadt pas als het blok
 * opengaat (zie Fold); alleen Engelse catalogusdata.
 */
export function OtherPrints({ cardKey }: { cardKey: string }): JSX.Element {
  const [prints, setPrints] = useState<OtherPrint[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState<OtherPrint | null>(null)

  useEffect(() => {
    let cancelled = false
    getOtherPrints(cardKey)
      .then((list) => {
        if (!cancelled) setPrints(list)
      })
      .catch((err: unknown) => {
        console.warn('Andere prints ophalen mislukt', err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [cardKey])

  if (failed) return <p className="muted small">Could not load other prints. Check your connection and try again later.</p>
  if (!prints) return <p className="muted small">Looking for other prints…</p>
  if (prints.length === 0) return <p className="muted small">No other prints of this card in the catalog (same artwork, attacks and illustrator).</p>
  return (
    <>
      <ul className="other-prints">
        {prints.map((p) => (
          <li key={p.key}>
            <button type="button" className="other-print" onClick={() => setZoom(p)} aria-label={`Show ${p.name}, ${p.setName} #${p.localId} large`}>
              <CatalogKeyPicture cardKey={p.key} image={p.image} name={p.name} quality="low" alt="" fallback={<CardFace name={p.name} detail={p.setName} />} />
              <span className="small">{p.setName}</span>
              <span className="muted small">#{p.localId}</span>
            </button>
            <a className="other-print-set small" href={`#/sets/en/${encodeURIComponent(p.setId)}`}>
              Open set ›
            </a>
          </li>
        ))}
      </ul>
      {zoom && (
        <CardZoom label={`${zoom.name}, ${zoom.setName} #${zoom.localId}`} onClose={() => setZoom(null)}>
          <CatalogKeyPicture
            cardKey={zoom.key}
            image={zoom.image}
            name={zoom.name}
            quality="high"
            alt={`${zoom.name}, ${zoom.setName} #${zoom.localId}`}
            fallback={<CardFace name={zoom.name} detail={zoom.setName} />}
          />
        </CardZoom>
      )}
    </>
  )
}
