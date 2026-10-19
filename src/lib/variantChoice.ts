import { marketValue } from './prices'
import { getCardInfo, getCardPrice, type CardmarketPrice } from './tcgdex'
import { VARIANT_LABELS, type Variant } from './types'

/**
 * Uitvoering kiezen bij een gescande kaart. Of een kaart holo of reverse holo is, ziet de scan slecht;
 * de catalogus weet welke uitvoeringen bestaan, en de prijs zegt of het uitmaakt.
 */

export const ALL_VARIANTS = Object.keys(VARIANT_LABELS) as Variant[]

/** Vanaf dit prijsverschil (EUR) tussen gewoon en reverse holo vraagt de app welke je hebt. */
export const VARIANT_PRICE_GAP = 0.25

/** Keuzes: wat de catalogus kent; onbekend = alles. */
export function variantOptions(allowed: readonly Variant[] | null | undefined): Variant[] {
  return allowed && allowed.length > 0 ? [...allowed] : ALL_VARIANTS
}

/**
 * Gelezen uitvoering, als die volgens de catalogus bestaat. Bestaat er maar één, dan die.
 * Anders onbekend (null): liever vragen dan een verkeerde prijs.
 */
export function fitVariant(read: Variant | null, allowed: readonly Variant[] | null | undefined): Variant | null {
  if (!allowed || allowed.length === 0) return read
  if (read && allowed.includes(read)) return read
  return allowed.length === 1 ? allowed[0] : null
}

export interface VariantGap {
  /** De gewone uitvoering (normal, holo of 1st edition) waarvoor de basisprijs geldt. */
  base: Variant
  baseValue: number
  reverseValue: number
}

/**
 * Prijsverschil tussen de gewone uitvoering en reverse holo, als dat er toe doet (≥ VARIANT_PRICE_GAP).
 * Alleen als de catalogus precies één gewone uitvoering naast reverse holo kent: Cardmarket heeft per kaart
 * maar één basisprijs, dus bij meer gewone uitvoeringen weten we niet bij welke die hoort.
 */
export function variantPriceGap(price: CardmarketPrice | null | undefined, allowed: readonly Variant[] | null | undefined): VariantGap | null {
  if (!price || !allowed || !allowed.includes('reverse')) return null
  const plain = allowed.filter((v) => v !== 'reverse')
  if (plain.length !== 1) return null
  const baseValue = marketValue(price, plain[0])?.value
  const reverseValue = marketValue(price, 'reverse')?.value
  if (baseValue === undefined || reverseValue === undefined) return null
  return Math.abs(reverseValue - baseValue) >= VARIANT_PRICE_GAP ? { base: plain[0], baseValue, reverseValue } : null
}

export interface VariantFacts {
  /** Uitvoeringen volgens de catalogus; null = onbekend. */
  variants: Variant[] | null
  /** De prijs verschilt per uitvoering: even nakijken. */
  askVariant: boolean
}

const UNKNOWN: VariantFacts = { variants: null, askVariant: false }

/** Uitvoeringen en prijsverschil van een kaart (één verzoek, gecachet). Bij een fout: onbekend, niet blokkeren. */
export async function variantFacts(key: string | null | undefined): Promise<VariantFacts> {
  if (!key) return UNKNOWN
  try {
    const [info, price] = await Promise.all([getCardInfo(key), getCardPrice(key)])
    const variants = info?.variants ?? null
    return { variants, askVariant: variantPriceGap(price, variants) !== null }
  } catch (err) {
    console.warn(`Uitvoeringen ophalen mislukt voor ${key}`, err)
    return UNKNOWN
  }
}
