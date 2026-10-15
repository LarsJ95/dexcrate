import type { CardInput } from './types'

/**
 * Zoeken in je eigen kaarten: elk woord moet ergens voorkomen (naam, set, nummer, kanaal, notities, druk).
 * "mew 151" vindt Mew ex uit set 151; een lege zoekopdracht vindt alles.
 */
export function matchesSearch(c: CardInput, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [c.name, c.set_code, c.card_number, c.card_number && `#${c.card_number}`, c.purchase_channel, c.sale_channel, c.notes, c.edition]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase()
  return words.every((w) => haystack.includes(w))
}
