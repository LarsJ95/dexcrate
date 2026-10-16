import { useState, type JSX, type ReactNode } from 'react'
import { useKeyed } from '../hooks/useKeyed'
import { limitlessEnCardUrl, ptcgCardUrl } from '../lib/cardImages'
import { findPcHash, pcImageUrl } from '../lib/pricecharting'
import { getPtcgSets, ptcgImagesFor, type PtcgSets } from '../lib/setIcons'
import { getSetAbbr, getSetList, imageCandidates, imageCandidatesForKey, setOfKey, type Lang, type SetSummary } from '../lib/tcgdex'
import { CardPicture } from './CardPicture'

interface CardRef {
  lang: Lang
  setId: string
  localId: string
  /** Kaartnaam, voor PriceCharting. */
  name: string
  quality: 'low' | 'high'
}

interface Props extends CardRef {
  /** TCGdex-plaatje (zonder /low.webp). */
  image: string | null
  tcgplayerId?: number | null
  alt: string
  className?: string
  /** Wat er staat als geen enkele bron een plaatje heeft (meestal de getekende voorkant). */
  fallback: ReactNode
}

const loadPtcg = (): Promise<PtcgSets> => getPtcgSets()
const loadSetList = (lang: string): Promise<Map<string, SetSummary>> => getSetList(lang as Lang)
const loadAbbr = (key: string): Promise<string | null> => {
  const [lang, setId] = key.split('|')
  return getSetAbbr(lang as Lang, setId)
}

/** Laatste redmiddel: PriceCharting (via de Edge Function card-image). */
function PriceChartingImage({ lang, setId, localId, name, quality, setName, alt, className, fallback }: CardRef & { setName: string; alt: string; className?: string; fallback: ReactNode }): JSX.Element {
  const key = `${lang}/${setId}-${localId}|${name.replaceAll('|', ' ')}|${setName.replaceAll('|', ' ')}`
  const hash = useKeyed(key, findPcHashFor)
  const [failed, setFailed] = useState<string | null>(null)
  const src = hash ? pcImageUrl(hash, quality) : null
  if (!src || failed === src) return <>{fallback}</>
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(src)} />
}

const findPcHashFor = (key: string): Promise<string | null> => {
  const [cardKey, name, setName] = key.split('|')
  const localId = cardKey.slice(cardKey.lastIndexOf('-') + 1)
  return findPcHash(cardKey, name, localId, setName)
}

/**
 * Pas als de gewone bronnen niets hebben: Limitless (Engels), pokemontcg.io en ten slotte PriceCharting.
 * Zo kosten kaarten met een gewone foto geen extra verzoeken.
 */
export function ExtraSources({ fallback, alt, className, ...card }: CardRef & { alt: string; className?: string; fallback: ReactNode }): JSX.Element {
  const en = card.lang === 'en'
  const ptcg = useKeyed(en ? 'all' : null, loadPtcg)
  const sets = useKeyed(en ? card.lang : null, loadSetList)
  const abbr = useKeyed(en ? `${card.lang}|${card.setId}` : null, loadAbbr)
  if (!en) return <>{fallback}</>
  const setName = sets?.get(card.setId)?.name ?? ''
  // Elke bron doet mee zodra hij bekend is; de trage pokemontcg.io-lijst houdt Limitless niet op.
  const extras = [
    limitlessEnCardUrl(abbr, card.setId, card.localId, card.quality),
    ptcgCardUrl(ptcgImagesFor(ptcg, card.setId, setName)?.id, card.setId, card.localId, card.quality),
  ].filter((u): u is string => u !== null)
  const settled = ptcg !== undefined && sets !== undefined && abbr !== undefined
  // PriceCharting pas als alle andere bronnen bekend zijn en niets hadden.
  const last = settled && setName ? <PriceChartingImage {...card} setName={setName} alt={alt} className={className} fallback={fallback} /> : fallback
  return <CardPicture sources={extras} alt={alt} className={className} fallback={last} />
}

/** Zelfde keten voor een kaart-sleutel ("en/svp-196"). Onleesbare sleutel: alleen het TCGdex-plaatje. */
export function CatalogKeyPicture({ cardKey, image, ...rest }: Omit<Props, 'lang' | 'setId' | 'localId'> & { cardKey: string }): JSX.Element {
  const s = setOfKey(cardKey)
  if (!s) return <CardPicture sources={imageCandidatesForKey(cardKey, image, rest.quality)} alt={rest.alt} className={rest.className} fallback={rest.fallback} />
  return <CatalogCardPicture {...rest} image={image} lang={s.lang} setId={s.setId} localId={s.cardId.slice(s.setId.length + 1)} />
}

/** Kaartfoto uit de catalogus met de volledige terugvalketen: TCGdex → Limitless → pokemontcg.io → TCGplayer → PriceCharting. */
export function CatalogCardPicture({ image, tcgplayerId, alt, className = 'card-img', fallback, ...card }: Props): JSX.Element {
  return (
    <CardPicture
      sources={imageCandidates(card.lang, card.setId, card.localId, image, card.quality, tcgplayerId)}
      alt={alt}
      className={className}
      fallback={<ExtraSources {...card} alt={alt} className={className} fallback={fallback} />}
    />
  )
}
