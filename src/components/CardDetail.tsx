import { useEffect, useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { useLocations } from '../hooks/useLocations'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { placeLabel } from '../lib/binder'
import { foilStyleFor } from '../lib/cardTraits'
import { applyPageType } from '../lib/energy'
import { updateCard } from '../lib/db'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import {
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  VARIANT_LABELS,
  primaryPhoto,
  statusBadge,
  statusFields,
  type Card,
  type CardStatus,
} from '../lib/types'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { CardZoom } from './CardZoom'
import { ChangeBadge } from './ChangeBadge'
import { HoloCard } from './HoloCard'
import { PhotoManager } from './PhotoManager'
import { PriceChart } from './PriceChart'
import { EnergyIcon, RaritySymbols } from './RaritySymbols'
import { CardSetSymbol } from './SetIcon'
import { ValuePanel } from './ValuePanel'
import { SaleDialog } from './SaleDialog'

interface Props {
  card: Card
  onEdit: (status?: CardStatus) => void
  onSaved: (rows: Card[]) => void
  /** Kaart bijgewerkt zonder de popup te sluiten (bv. foto). */
  onChanged: (row: Card) => void
  /** Verkoop vastgelegd via de verkoopdialoog. */
  onSold: () => void
}

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

const cents = (n: number): number => Math.round(n * 100)

/** Overzicht van één kaart: foto, kenmerken, prijzen en snelle statusacties. */
export function CardDetail({ card, onEdit, onSaved, onChanged, onSold }: Props): JSX.Element {
  const info = useCardInfo(card.tcgdex_id)
  const price = useCardPrice(card.kind === 'card' ? card.tcgdex_id : null)
  const market = marketValue(price, card.variant)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [selling, setSelling] = useState(false)
  const type = info?.types?.[0] ?? null
  const foil = card.status === 'sold' ? 'none' : foilStyleFor(card.variant, info?.rarity)

  // De app kleurt mee met het energietype van de kaart in beeld (DESIGN.md §4).
  useEffect(() => (type ? applyPageType(type) : undefined), [type])
  // Verkopen als transactie (STAP5): met kosten, status en eventueel deel van de stuks.
  const salesTracked = useTransactionsEnabled() === true
  // Eigen foto's beheren kan pas als STAP4 gedraaid is.
  const v2 = useSchemaV2() === true
  const main = primaryPhoto(card)
  const locations = useLocations(v2)
  const place = placeLabel(card, new Map(locations.map((l) => [l.id, l])))

  const facts = [
    card.language ? LANGUAGE_LABELS[card.language] : null,
    card.variant ? VARIANT_LABELS[card.variant] : null,
    card.condition ? CONDITION_LABELS[card.condition] : null,
    card.grading_company ? `${card.grading_company} ${card.grade ?? ''}`.trim() : null,
    card.edition,
    card.quantity > 1 ? `${card.quantity}×` : null,
  ].filter((f): f is string => f !== null)

  // Resultaat: verkocht → verkoop − aankoop; anders marktwaarde − aankoop (op papier).
  const reference = card.status === 'sold' ? card.sale_price : (market?.value ?? null)
  const result = card.purchase_price !== null && reference !== null ? (cents(reference) - cents(card.purchase_price)) * card.quantity / 100 : null

  async function markSold(): Promise<void> {
    if (busy) return
    if (salesTracked) {
      setSelling(true)
      return
    }
    // Meerdere stuks: via het formulier, zodat je kunt kiezen hoeveel.
    if (card.quantity > 1) {
      onEdit('sold')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved([await updateCard(card.id, { ...statusFields('sold'), sale_date: new Date().toLocaleDateString('sv-SE') })])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
      setBusy(false)
    }
  }

  const image = (
    <CardImage
      tcgdexId={card.tcgdex_id}
      kind={card.kind}
      name={card.name}
      photoPath={main?.path ?? card.image_path}
      detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
      quality="high"
    />
  )

  return (
    <div className="card-detail">
      {zoomOpen && (
        <CardZoom label={card.name} onClose={() => setZoomOpen(false)}>
          <HoloCard foil={foil} interactive>
            {image}
          </HoloCard>
        </CardZoom>
      )}
      <div className="detail-top">
        <div className="detail-image">
          <button type="button" className="zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Enlarge ${card.name}`}>
            <HoloCard foil={foil}>{image}</HoloCard>
          </button>
        </div>

        <div className="detail-info">
          <p className="detail-set">
            {card.kind === 'card' && <CardSetSymbol tcgdexId={card.tcgdex_id} />}
            {card.kind === 'sealed'
              ? 'Sealed product'
              : [info?.set.name ?? card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
          </p>

          <div className="chips">
            <span className={`chip status-${card.status}`}>{statusBadge(card) ?? 'In collection'}</span>
            {info?.rarity && (
              <span className="chip">
                <RaritySymbols rarity={info.rarity} />
                {info.rarity}
              </span>
            )}
            {type && (
              <span className="chip chip-type">
                <EnergyIcon type={type} />
                {type}
              </span>
            )}
            {facts.map((f) => (
              <span key={f} className="chip">
                {f}
              </span>
            ))}
          </div>

          <dl className="detail-prices">
            {card.kind === 'card' && card.tcgdex_id && (
              <div className="detail-market">
                <dt>Market{card.variant === 'reverse' ? ' (reverse)' : ''}</dt>
                <dd>
                  {price === undefined ? '…' : market ? formatEur(market.value) : '–'}
                  {market && <ChangeBadge change={market.change30} />}
                </dd>
              </div>
            )}
            {card.purchase_price !== null && (
              <div>
                <dt>Paid</dt>
                <dd>{formatEur(card.purchase_price)}</dd>
              </div>
            )}
            {card.status !== 'collection' && card.sale_price !== null && (
              <div>
                <dt>{card.status === 'sold' ? 'Sold for' : 'Asking'}</dt>
                <dd>{formatEur(card.sale_price)}</dd>
              </div>
            )}
            {result !== null && (
              <div>
                <dt>{card.status === 'sold' ? 'Profit' : 'Gain'}</dt>
                <dd className={result >= 0 ? 'up' : 'down'}>{signedEur(result)}</dd>
              </div>
            )}
          </dl>

          {(card.cert_number || card.notes || place) && (
            <dl className="detail-meta">
              {place && (
                <div>
                  <dt>Location</dt>
                  <dd>{place}</dd>
                </div>
              )}
              {card.cert_number && (
                <div>
                  <dt>Certificate</dt>
                  <dd>{card.cert_number}</dd>
                </div>
              )}
              {card.notes && (
                <div>
                  <dt>Notes</dt>
                  <dd className="detail-notes">{card.notes}</dd>
                </div>
              )}
            </dl>
          )}

          {card.kind === 'card' && (
            <CardmarketLink idProduct={price?.idProduct ?? null} searchText={[card.name, card.card_number].filter(Boolean).join(' ')} />
          )}
        </div>
      </div>

      <ValuePanel card={card} price={price} />

      {card.kind === 'card' && card.tcgdex_id && <PriceChart tcgdexId={card.tcgdex_id} reverse={card.variant === 'reverse'} />}

      {v2 && <PhotoManager card={card} onChange={onChanged} />}

      {selling && (
        <SaleDialog
          cards={[card]}
          onClose={() => setSelling(false)}
          onSaved={() => {
            setSelling(false)
            onSold()
          }}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="sheet-foot">
        <button type="button" onClick={() => onEdit()}>
          Edit
        </button>
        <span className="spacer" />
        {card.status === 'collection' && (
          <button type="button" className="primary" onClick={() => onEdit('for_sale')}>
            List for sale
          </button>
        )}
        {card.status === 'for_sale' && (
          <button type="button" className="primary" onClick={() => void markSold()} disabled={busy}>
            {busy ? 'Saving…' : 'Mark as sold'}
          </button>
        )}
      </footer>
    </div>
  )
}
