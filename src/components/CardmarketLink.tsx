import type { JSX } from 'react'
import { cardmarketUrl } from '../lib/tcgdex'

/** Link naar de Cardmarket-productpagina, of een zoekopdracht als het product-id onbekend is. */
export function CardmarketLink({ idProduct, searchText }: { idProduct: number | null; searchText: string }): JSX.Element {
  return (
    <a className="external-link" href={cardmarketUrl(idProduct, searchText)} target="_blank" rel="noopener noreferrer">
      {idProduct ? 'View on Cardmarket' : 'Search on Cardmarket'}
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
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  )
}
