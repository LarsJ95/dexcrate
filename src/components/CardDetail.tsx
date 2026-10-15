import { useRef, useState, type ChangeEvent, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import { updateCard } from '../lib/db'
import { clearCardPhoto, setCardPhoto } from '../lib/photos'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { CONDITION_LABELS, LANGUAGE_LABELS, STATUS_LABELS, VARIANT_LABELS, type Card, type CardStatus } from '../lib/types'
import { CameraCapture } from './CameraCapture'
import { CardImage } from './CardImage'
import { CardmarketLink } from './CardmarketLink'
import { CardZoom } from './CardZoom'
import { ChangeBadge } from './ChangeBadge'
import { Foil } from './Foil'
import { PriceChart } from './PriceChart'

interface Props {
  card: Card
  onEdit: (status?: CardStatus) => void
  onSaved: (rows: Card[]) => void
  /** Kaart bijgewerkt zonder de popup te sluiten (bv. foto). */
  onChanged: (row: Card) => void
}

function signedEur(n: number): string {
  if (Math.abs(n) < 0.005) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

const cents = (n: number): number => Math.round(n * 100)

/** Overzicht van één kaart: foto, kenmerken, prijzen en snelle statusacties. */
export function CardDetail({ card, onEdit, onSaved, onChanged }: Props): JSX.Element {
  const info = useCardInfo(card.tcgdex_id)
  const price = useCardPrice(card.kind === 'card' ? card.tcgdex_id : null)
  const market = marketValue(price, card.variant)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const facts = [
    card.language ? LANGUAGE_LABELS[card.language] : null,
    card.variant ? VARIANT_LABELS[card.variant] : null,
    card.condition ? CONDITION_LABELS[card.condition] : null,
    card.grading_company ? `${card.grading_company} ${card.grade ?? ''}`.trim() : null,
    card.quantity > 1 ? `${card.quantity}×` : null,
  ].filter((f): f is string => f !== null)

  // Resultaat: verkocht → verkoop − aankoop; anders marktwaarde − aankoop (op papier).
  const reference = card.status === 'sold' ? card.sale_price : (market?.value ?? null)
  const result = card.purchase_price !== null && reference !== null ? (cents(reference) - cents(card.purchase_price)) * card.quantity / 100 : null

  async function savePhoto(photo: Blob): Promise<void> {
    setCameraOpen(false)
    setPhotoBusy(true)
    setError(null)
    try {
      onChanged(await setCardPhoto(card, photo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the photo failed.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto(): Promise<void> {
    setPhotoBusy(true)
    setError(null)
    try {
      onChanged(await clearCardPhoto(card))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removing the photo failed.')
    } finally {
      setPhotoBusy(false)
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void savePhoto(file)
  }

  async function markSold(): Promise<void> {
    if (busy) return
    // Meerdere stuks: via het formulier, zodat je kunt kiezen hoeveel.
    if (card.quantity > 1) {
      onEdit('sold')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved([await updateCard(card.id, { status: 'sold', sale_date: new Date().toLocaleDateString('sv-SE') })])
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
      photoPath={card.image_path}
      detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
      quality="high"
    />
  )

  return (
    <div className="card-detail">
      {zoomOpen && (
        <CardZoom label={card.name} onClose={() => setZoomOpen(false)}>
          {image}
        </CardZoom>
      )}
      <div className="detail-top">
        <div className="detail-image">
          <button type="button" className="foil-wrap zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Enlarge ${card.name}`}>
            {image}
            {card.status !== 'sold' && <Foil variant={card.variant} seed={card.id} />}
          </button>
          <div className="photo-actions">
            <button type="button" className="ghost small-btn" onClick={() => setCameraOpen(true)} disabled={photoBusy}>
              {photoBusy ? 'Saving…' : card.image_path ? 'Change photo' : 'Add photo'}
            </button>
            {card.image_path && (
              <button type="button" className="ghost small-btn" onClick={() => void removePhoto()} disabled={photoBusy}>
                Remove
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        </div>

        <div className="detail-info">
          <p className="detail-set">
            {card.kind === 'sealed'
              ? 'Sealed product'
              : [info?.set.name ?? card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')}
          </p>

          <div className="chips">
            <span className={`chip status-${card.status}`}>{STATUS_LABELS[card.status]}</span>
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

          {card.kind === 'card' && (
            <CardmarketLink idProduct={price?.idProduct ?? null} searchText={[card.name, card.card_number].filter(Boolean).join(' ')} />
          )}
        </div>
      </div>

      {card.kind === 'card' && card.tcgdex_id && <PriceChart tcgdexId={card.tcgdex_id} reverse={card.variant === 'reverse'} />}

      {cameraOpen && (
        <CameraCapture
          wide={false}
          onCapture={(file) => void savePhoto(file)}
          onPickFile={() => {
            setCameraOpen(false)
            fileRef.current?.click()
          }}
          onClose={() => setCameraOpen(false)}
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
