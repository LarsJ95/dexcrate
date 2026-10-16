import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { readCache, writeCache } from './tcgdex'

/**
 * Laatste redmiddel voor kaartfoto's: PriceCharting, via de Edge Function `card-image` (die zoekt en
 * geeft regels terug). Hier wordt streng gekozen: een verkeerd plaatje is erger dan geen plaatje.
 */

export interface PcRow {
  /** Bv. "Charizard #1" of "Unown [A]". */
  title: string
  /** Set bij PriceCharting, bv. "Pokemon McDonalds 2024". */
  console: string
  hash: string
}

const IMG = 'https://storage.googleapis.com/images.pricecharting.com'
const PREFIX = 'pc:img:v1:'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Woorden die niets zeggen over welke set het is. */
const GENERIC = new Set(['pokemon', 'collection', 'the', 'and', 'set', 'black', 'star', 'card', 'cards'])

export function pcImageUrl(hash: string, quality: 'low' | 'high'): string | null {
  return /^[a-z0-9]{6,80}$/.test(hash) ? `${IMG}/${hash}/${quality === 'high' ? '1600' : '240'}.jpg` : null
}

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w === 'promos' ? 'promo' : w))

const sameNumber = (a: string, b: string): boolean => a.replace(/^0+(?=.)/, '').toLowerCase() === b.replace(/^0+(?=.)/, '').toLowerCase()

/** Zoekterm voor PriceCharting: kaartnaam + setnaam. */
export function pcQuery(name: string, setName: string): string {
  return `${name} ${setName}`.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** Beste regel voor deze kaart, of null als geen enkele regel zeker genoeg is. */
export function pickRow(rows: readonly PcRow[], name: string, number: string, setName: string): PcRow | null {
  const nameWords = words(name)
  const setWords = words(setName).filter((w) => !GENERIC.has(w))
  const years = setWords.filter((w) => /^(19|20)\d\d$/.test(w))
  let best: { row: PcRow; score: number } | null = null
  for (const row of rows) {
    const brackets = [...row.title.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim())
    const numMatch = row.title.match(/#\s*([A-Za-z0-9-]+)(?:\/[A-Za-z0-9-]+)?\s*$/)
    const bare = row.title.replace(/\[[^\]]*\]/g, ' ').replace(/#.*$/, ' ')
    // Naam moet precies kloppen ("Dark Charizard" is niet "Charizard").
    const titleWords = words(bare)
    if (titleWords.length !== nameWords.length || !nameWords.every((w) => titleWords.includes(w))) continue
    const consoleWords = new Set(words(row.console))
    if (!years.every((y) => consoleWords.has(y))) continue
    const setHits = setWords.filter((w) => consoleWords.has(w)).length
    // Nummer: "#23", of als variant tussen haken ("Unown [A]").
    const numberInBrackets = brackets.some((b) => sameNumber(b, number))
    const hasNumber = numMatch !== null || numberInBrackets
    if (hasNumber && !(numberInBrackets || (numMatch !== null && sameNumber(numMatch[1], number)))) continue
    if (hasNumber ? setHits < 1 : setHits < Math.max(1, Math.ceil(setWords.length / 2))) continue
    const otherBrackets = brackets.filter((b) => !sameNumber(b, number)).length
    const score = (hasNumber ? 10 : 0) + setHits - otherBrackets * 2
    if (!best || score > best.score) best = { row, score }
  }
  return best?.row ?? null
}

const isRow = (v: unknown): v is PcRow =>
  typeof v === 'object' && v !== null && typeof (v as PcRow).title === 'string' && typeof (v as PcRow).console === 'string' && typeof (v as PcRow).hash === 'string'

/** Functie niet geïnstalleerd of niet bereikbaar: deze sessie niet meer proberen. */
let unavailable = false
const pending = new Map<string, Promise<string | null>>()

/**
 * Plaatjes-id bij PriceCharting voor een kaart ("<taal>/<kaart-id>"), 30 dagen lokaal bewaard
 * (ook "niet gevonden", zodat niet elke keer opnieuw gezocht wordt).
 */
export function findPcHash(key: string, name: string, number: string, setName: string): Promise<string | null> {
  const cached = readCache<string>(PREFIX, TTL_MS, key)
  if (cached) return Promise.resolve(cached === 'none' ? null : cached)
  if (unavailable || !name || !setName) return Promise.resolve(null)
  let p = pending.get(key)
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.functions.invoke('card-image', { body: { q: pcQuery(name, setName) } })
      if (error) {
        // 404 = functie bestaat niet; dan niet blijven proberen. Andere fouten: later opnieuw.
        if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) unavailable = true
        console.warn('PriceCharting-zoekopdracht mislukt', error)
        return null
      }
      const rows = typeof data === 'object' && data !== null && Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: unknown[] }).rows.filter(isRow) : []
      const hash = pickRow(rows, name, number, setName)?.hash ?? null
      writeCache(PREFIX, key, hash ?? 'none')
      return hash
    })().finally(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}
