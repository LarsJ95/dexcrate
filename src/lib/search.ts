import type { CardInput } from './types'

/** Elk woord van de zoekopdracht moet in een van de velden voorkomen; leeg vindt alles. */
export function matchesWords(fields: readonly (string | null | undefined)[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase()
  return words.every((w) => haystack.includes(w))
}

/**
 * Zoeken in je eigen kaarten (naam, set, nummer, kanaal, notities, druk).
 * "mew 151" vindt Mew ex uit set 151.
 */
export function matchesSearch(c: CardInput, query: string): boolean {
  return matchesWords(
    [c.name, c.set_code, c.card_number, c.card_number && `#${c.card_number}`, c.purchase_channel, c.sale_channel, c.notes, c.edition],
    query,
  )
}
