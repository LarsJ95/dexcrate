import { useEffect, useState, type JSX } from 'react'
import { getOtherPrints, type OtherPrint } from '../lib/prints'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'

/**
 * Andere prints van deze kaart (herdrukken in andere sets), aantikbaar naar die set. Laadt pas als het blok
 * opengaat (zie Fold); alleen Engelse catalogusdata.
 */
export function OtherPrints({ cardKey }: { cardKey: string }): JSX.Element {
  const [prints, setPrints] = useState<OtherPrint[] | null>(null)
  const [failed, setFailed] = useState(false)

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
    <ul className="other-prints">
      {prints.map((p) => (
        <li key={p.key}>
          <a href={`#/sets/en/${encodeURIComponent(p.setId)}`} title={`${p.setName} #${p.localId}`}>
            <CatalogKeyPicture cardKey={p.key} image={p.image} name={p.name} quality="low" alt={`${p.name}, ${p.setName}`} fallback={<CardFace name={p.name} detail={p.setName} />} />
            <span className="small">{p.setName}</span>
            <span className="muted small">#{p.localId}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
