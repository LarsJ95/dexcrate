import { useEffect, useMemo, useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useOwnedCards } from '../hooks/useOwnedCards'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { useTransactionsEnabled } from '../hooks/useTransactionsEnabled'
import { foilStyleFor } from '../lib/cardTraits'
import { applyPageType, favouriteType } from '../lib/energy'
import { updateCard } from '../lib/db'
import { marketValue } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { speciesName } from '../lib/runner'
import { setOfKey } from '../lib/tcgdex'
import { cardLanguageOf } from '../lib/cardmarket'
import {
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  LINK_STATUS_LABELS,
  VARIANT_LABELS,
  primaryPhoto,
  statusBadge,
  statusFields,
  type Card,
  type CardStatus,
} from '../lib/types'
import { CardGameInfo } from './CardGameInfo'
import { CardImage } from './CardImage'
import { DexStrip, SetProgress, ValueBar, VariantQuestion } from './CardOverviewParts'
import { CardmarketLink } from './CardmarketLink'
import { CardFacts, CardPrice, Fold, type Fact } from './CardSheetParts'
import { CardZoom } from './CardZoom'
import { ChangeBadge } from './ChangeBadge'
import { HoloCard } from './HoloCard'
import { PhotoManager } from './PhotoManager'
import { PriceChart } from './PriceChart'
import { RarityChip, TypeChip } from './Chips'
import { CardSetSymbol } from './SetIcon'
import { ValuePanel } from './ValuePanel'
import { SaleDialog } from './SaleDialog'
import { errorText } from '../lib/errors'

interface Props {
  card: Card
  onEdit: (status?: CardStatus) => void
  onSaved: (rows: Card[]) => void
  /** Kaart bijgewerkt zonder de popup te sluiten (bv. foto). */
  onChanged: (row: Card) => void
  /** Verkoop vastgelegd via de verkoopdialoog. */
  onSold: () => void
}

const MATCH_HELP: Record<string, string> = {
  exact: 'Set and number matched exactly.',
  approximate: 'Matched on name; set or number may differ.',
  unconfirmed: 'Linked automatically but not checked. Use Edit to confirm or change it.',
  manual: 'You chose this card yourself.',
}

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

  // De app kleurt mee met het energietype; Colorless (grijs) krijgt het type dat je het meest verzamelt.
  const pageType = type === 'Colorless' ? favouriteType() : type
  useEffect(() => (pageType ? applyPageType(pageType) : undefined), [pageType])

  // Jouw kaarten: voor setvoortgang en welke Pokémon van de evolutielijn je hebt.
  const owned = useOwnedCards()
  const ownedKeys = useMemo(() => (owned ?? []).flatMap((c) => (c.tcgdex_id ? [c.tcgdex_id] : [])), [owned])
  const ownedInfos = useCatalogInfos(ownedKeys, Boolean(info?.dexId))
  const ownedDex = useMemo(() => new Set([...ownedInfos.values()].flatMap((i) => (i?.dexId ? [i.dexId] : []))), [ownedInfos])
  const setRef = card.tcgdex_id ? setOfKey(card.tcgdex_id) : null
  // Verkopen als transactie (STAP5): met kosten, status en eventueel deel van de stuks.
  const salesTracked = useTransactionsEnabled() === true
  // Eigen foto's beheren kan pas als STAP4 gedraaid is.
  const v2 = useSchemaV2() === true
  const main = primaryPhoto(card)

  // Alles uitgelijnd naast de foto (ontwerp B, 18-10-2026); lege kenmerken weglaten.
  const factList: (Fact | null)[] = [
    { label: 'Status', value: statusBadge(card) ?? 'In collection' },
    info?.rarity ? { label: 'Rarity', value: <RarityChip rarity={info.rarity} /> } : null,
    card.condition ? { label: 'Condition', value: CONDITION_LABELS[card.condition] } : null,
    type ? { label: 'Type', value: <TypeChip type={type} /> } : null,
    card.language ? { label: 'Language', value: LANGUAGE_LABELS[card.language] } : null,
    card.grading_company ? { label: 'Grade', value: `${card.grading_company} ${card.grade ?? ''}`.trim() } : null,
    card.edition ? { label: 'Edition', value: card.edition } : null,
    card.quantity > 1 ? { label: 'Copies', value: `${card.quantity}×` } : null,
    { label: 'Paid', value: card.purchase_price !== null ? formatEur(card.purchase_price) : '–' },
    card.status !== 'collection' && card.sale_price !== null ? { label: card.status === 'sold' ? 'Sold for' : 'Asking', value: formatEur(card.sale_price) } : null,
  ]
  const facts = factList.filter((f): f is Fact => f !== null)

  // Resultaat: verkocht → verkoop tegenover aankoop; anders marktwaarde tegenover aankoop (op papier).
  const reference = card.status === 'sold' ? card.sale_price : (market?.value ?? null)
  const hasMarket = card.kind === 'card' && card.tcgdex_id !== null

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
      setError(errorText(err, 'Update failed.'))
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
    <div className="card-detail cd">
      {zoomOpen && (
        <CardZoom label={card.name} onClose={() => setZoomOpen(false)}>
          <HoloCard foil={foil} interactive>
            {image}
          </HoloCard>
        </CardZoom>
      )}
      <p className="cd-set">
        {card.kind === 'card' && <CardSetSymbol tcgdexId={card.tcgdex_id} />}
        {card.kind === 'sealed' ? 'Sealed product' : [info?.set.name ?? card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' · ')}
      </p>

      <div className="cd-hero">
        <div className="cd-image">
          <button type="button" className="zoom-trigger" onClick={() => setZoomOpen(true)} aria-label={`Enlarge ${card.name}`}>
            <HoloCard foil={foil}>{image}</HoloCard>
          </button>
        </div>
        <CardFacts
          price={
            hasMarket && (
              <CardPrice
                label={`Market${card.variant ? ` · ${VARIANT_LABELS[card.variant]}` : ''}`}
                value={price === undefined ? '…' : market ? formatEur(market.value) : '–'}
                change={market && <ChangeBadge change={market.change30} label="vs 30-day avg" showLabel />}
              />
            )
          }
          facts={facts}
        >
          {card.purchase_price !== null && reference !== null && (
            <ValueBar paid={card.purchase_price} value={reference} quantity={card.quantity} sold={card.status === 'sold'} />
          )}
        </CardFacts>
      </div>

      {/* Alleen vragen als er echt iets te kiezen is (bestaat de kaart in maar één versie, dan klopt de prijs al). */}
      {hasMarket && !card.variant && info && (info.variants?.length ?? 2) > 1 && (
        <VariantQuestion card={card} options={info.variants ?? null} onChanged={onChanged} />
      )}

      {(info?.dexId || (setRef && owned)) && (
        <div className="cd-rows">
          {info?.dexId && <DexStrip dexId={info.dexId} name={speciesName(info.name)} ownedDex={ownedDex} />}
          {setRef && owned && <SetProgress lang={setRef.lang} setId={setRef.setId} setName={info?.set.name ?? card.set_code ?? setRef.setId} ownedKeys={ownedKeys} />}
        </div>
      )}
      {!info?.dexId && !setRef && card.kind === 'card' && (
        <p className="muted small">Link this card to the catalog (Edit) to see its Pokédex entry and set progress.</p>
      )}

      {(card.cert_number || card.notes) && (
        <dl className="detail-meta">
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

      <div className="cd-folds">
        {card.kind === 'card' && info?.game && (
          <Fold title="Card text" hint="Attacks, abilities, illustrator">
            <CardGameInfo game={info.game} illustrator={info.illustrator ?? null} />
            {card.link_status && (
              <dl className="detail-meta">
                <div>
                  <dt>Card match</dt>
                  <dd>
                    {LINK_STATUS_LABELS[card.link_status]}
                    <span className="muted small"> {MATCH_HELP[card.link_status] ?? ''}</span>
                  </dd>
                </div>
              </dl>
            )}
          </Fold>
        )}
        <Fold title="Prices" hint={hasMarket ? 'Sources and price history' : 'Your valuation'}>
          <ValuePanel card={card} price={price} />
          {hasMarket && card.tcgdex_id && <PriceChart tcgdexId={card.tcgdex_id} reverse={card.variant === 'reverse'} />}
        </Fold>
        {v2 && (
          <Fold title="Photos" hint="Your own photos of this card">
            <PhotoManager card={card} onChange={onChanged} />
          </Fold>
        )}
      </div>

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

      <footer className="sheet-foot detail-actions">
        <button type="button" onClick={() => onEdit()}>
          Edit
        </button>
        {card.kind === 'card' && (
          <CardmarketLink idProduct={price?.idProduct ?? null} searchText={[card.name, card.card_number].filter(Boolean).join(' ')} language={cardLanguageOf(card.language, card.tcgdex_id)} button />
        )}
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
