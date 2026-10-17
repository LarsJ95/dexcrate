import type { JSX } from 'react'
import { cardmarketUrl } from '../lib/tcgdex'

interface Props {
  idProduct: number | null
  searchText: string
  /** Taal van de kaart (zie cardLanguageOf); alleen Engels of onbekend krijgt de Engelse taalfilter. */
  language?: string | null
  /** Korte vorm ("Cardmarket") als knop, bv. in een lijstregel. */
  compact?: boolean
  /** Als gewone knop (actiebalk). */
  button?: boolean
}

/** Link naar de Cardmarket-productpagina, of een zoekopdracht als het product-id onbekend is. */
export function CardmarketLink({ idProduct, searchText, language = null, compact = false, button = false }: Props): JSX.Element {
  const label = idProduct ? 'View on Cardmarket' : 'Search on Cardmarket'
  return (
    <a
      className={button ? 'external-link button-link' : compact ? 'external-link cm-button' : 'external-link'}
      href={cardmarketUrl(idProduct, searchText, language)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact || button ? `${label} (opens in a new tab)` : undefined}
      title={compact ? label : undefined}
    >
      {compact ? (
        <span className="cm-button-text">Cardmarket</span>
      ) : button ? (
        <span>
          <span className="hide-narrow">{idProduct ? 'View on ' : 'Search on '}</span>Cardmarket
        </span>
      ) : (
        label
      )}
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <path
          d="M6 3h7v7M13 3 5.5 10.5M11 9.5V13H3V5h3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  )
}
