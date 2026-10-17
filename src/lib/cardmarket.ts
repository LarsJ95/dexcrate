import { splitKey } from './tcgdex'

/**
 * Link naar Cardmarket: de productpagina als het product-id bekend is, anders een zoekopdracht.
 * Formaat gebruikt door andere tools; door Cardmarkets botbescherming niet automatisch te controleren.
 *
 * Vaste Cardmarket-filters, overgenomen uit de eigen zoekinstellingen van de gebruiker (17-10-2026):
 * verkoper uit land 23, alle verkopertypes, reputatie 2 of beter,
 * conditie 3 = Excellent of beter (MT 1, NM 2, EX 3, GD 4, LP 5, PL 6, PO 7).
 * Taal 1 (Engels) alleen bij Engelse of onbekende taal; bij andere talen geen taalfilter, anders is er geen aanbod.
 */
const CARDMARKET_FILTERS = 'sellerCountry=23&sellerType=0,1,2&sellerReputation=2'
const CARDMARKET_ENGLISH = 'language=1'
const CARDMARKET_CONDITION = 'minCondition=3'

/** Taal van een kaart: het eigen taalveld, anders de taal uit de TCGdex-sleutel ("ja/…"), anders onbekend. */
export function cardLanguageOf(language: string | null | undefined, key: string | null | undefined): string | null {
  return language || (key ? (splitKey(key)?.lang ?? null) : null)
}

export function cardmarketUrl(idProduct: number | null, searchText: string, language: string | null = null): string {
  const filters = [CARDMARKET_FILTERS, ...(language === null || language === 'en' ? [CARDMARKET_ENGLISH] : []), CARDMARKET_CONDITION].join('&')
  if (idProduct) return `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${idProduct}&${filters}`
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(searchText.trim())}&${filters}`
}
