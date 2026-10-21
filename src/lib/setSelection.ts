import { cardmarketUrl } from './cardmarket'
import type { Lang, SetCard } from './tcgdex'
import type { WishlistInput } from './wishlist'

/**
 * Kaarten selecteren in een set (21-10-2026, op verzoek): in één keer op de wishlist zetten of op Cardmarket openen.
 */

/** Vanaf zoveel tabbladen eerst vragen of je ze echt allemaal wilt openen. */
export const MANY_TABS = 10

/** Wens voor een setkaart: 1 exemplaar, normale prioriteit, taal van de set (aanpassen kan daarna op de Wishlist). */
export function wishForSetCard(card: SetCard, lang: Lang, setCode: string): WishlistInput {
  const key = `${lang}/${card.id}`
  // Zelfde nummer als "Add to wishlist" in het kaartvenster: "025" wordt "25".
  const number = /^\d+$/.test(card.localId) ? String(Number.parseInt(card.localId, 10)) : card.localId
  return {
    // Grenzen uit de database (wishlist_items): sleutel 50, naam 1–200, set en nummer 20 tekens.
    tcgdex_id: key.length <= 50 ? key : null,
    name: (card.name.trim() || `#${card.localId}`).slice(0, 200),
    set_code: setCode.trim().slice(0, 20) || null,
    card_number: number.slice(0, 20) || null,
    variant: null,
    language: lang,
    min_condition: null,
    wanted_qty: 1,
    max_price: null,
    priority: 2,
    notes: null,
  }
}

/** Melding na toevoegen, bv. "9 cards added to your wishlist (3 already on it). Put in Birthday." */
export function wishSummary(added: number, already: number, lists: readonly string[]): string {
  const head =
    added > 0
      ? `${added} ${added === 1 ? 'card' : 'cards'} added to your wishlist${already > 0 ? ` (${already} already on it)` : ''}`
      : `${already === 1 ? 'This card was' : `All ${already} cards were`} already on your wishlist`
  return lists.length > 0 ? `${head}. Put in ${lists.join(', ')}.` : `${head}.`
}

/** Cardmarket-link van een setkaart: de productpagina als het id bekend is, anders zoeken op naam en nummer. */
export function cardmarketUrlFor(card: SetCard, lang: Lang, idProduct: number | null): string {
  return cardmarketUrl(idProduct, `${card.name} ${card.localId}`, lang)
}

type OpenFn = (url: string, target: string) => Window | null

/**
 * Links in nieuwe tabbladen openen, in volgorde. Browsers staan per klik meestal maar één nieuw tabblad toe
 * (Chrome: window.open verbruikt de klik), de rest wordt geblokkeerd tenzij je pop-ups toestaat voor de site.
 * Stopt bij het eerste geblokkeerde tabblad en geeft terug hoeveel er opengingen.
 * Geen "noopener" als optie: dan geeft window.open altijd null en is blokkeren niet te zien; daarom zelf opener wissen.
 */
export function openTabs(urls: readonly string[], open: OpenFn = (url, target) => window.open(url, target)): number {
  let opened = 0
  for (const url of urls) {
    const tab = open(url, '_blank')
    if (!tab) break
    tab.opener = null
    opened += 1
  }
  return opened
}
