import type { ItemInput } from './types'
import {
  findExact,
  getSetList,
  langFromName,
  resolveSetId,
  searchCards,
  setIdOf,
  stripLangTag,
  type Lang,
  type SetCard,
} from './tcgdex'

export interface Candidate {
  key: string
  name: string
  localId: string
  setId: string
  setName: string
  image: string | null
  score: number
  reason: string
}

export interface MatchQuery {
  name: string
  set_code: string | null
  card_number: string | null
}

const MAX_CANDIDATES = 12
/** Onder deze naamovereenkomst geldt een set+nummer-match als verdacht. */
const MIN_NAME_SIMILARITY = 0.5

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** 0–1: hoe sterk twee kaartnamen op elkaar lijken. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

const sameNumber = (a: string | null, b: string): boolean => {
  if (!a) return false
  if (a === b) return true
  const n = Number.parseInt(a, 10)
  return !Number.isNaN(n) && n === Number.parseInt(b, 10)
}

/**
 * Steeds kortere zoektermen, zodat een typo verderop in de naam nog resultaat geeft:
 * "Mega Darkray EX" → "Mega Darkray EX", "Darkray", "Dark".
 */
export function searchTerms(name: string): string[] {
  const clean = stripLangTag(name)
  const words = clean.split(' ').filter((w) => w.length > 2 && !/^(ex|gx|v|vmax|vstar|mega)$/i.test(w))
  const longest = [...words].sort((a, b) => b.length - a.length)[0]
  const terms = [clean, longest, longest?.slice(0, 4)]
  return [...new Set(terms.filter((t): t is string => !!t && t.length >= 3))]
}

/**
 * Zoekt de meest aannemelijke TCGdex-kaarten voor een regel, ook bij typo's in naam, set of nummer.
 * Volgorde: exacte set+nummer, daarna naam+nummer elders, daarna gelijkende namen.
 */
export async function findCandidates(q: MatchQuery, langOverride?: Lang): Promise<Candidate[]> {
  const lang = langOverride ?? langFromName(q.name)
  const byKey = new Map<string, Omit<Candidate, 'setName'>>()

  const add = (card: SetCard, setId: string, score: number, reason: string): void => {
    const key = `${lang}/${card.id}`
    const existing = byKey.get(key)
    if (!existing || existing.score < score) {
      byKey.set(key, { key, name: card.name, localId: card.localId, setId, image: card.image, score, reason })
    }
  }

  const expectedSet = q.set_code ? await resolveSetId(lang, q.set_code) : null
  if (q.set_code && q.card_number) {
    const exact = await findExact(lang, q.set_code, q.card_number)
    if (exact) {
      // Buitenlandse namen zijn niet te vergelijken met de Engelse naam uit de Excel.
      const sim = lang === 'en' ? nameSimilarity(stripLangTag(q.name), exact.name) : 1
      add(exact, exact.setId, 4 + sim * 4, sim >= MIN_NAME_SIMILARITY ? 'Set en nummer kloppen' : 'Set en nummer kloppen, naam niet')
    }
  }

  // Namen zijn alleen in het Engels doorzoekbaar met de (Engelse) naam uit de Excel.
  if (lang === 'en') {
    for (const term of searchTerms(q.name)) {
      const results = await searchCards(lang, term)
      for (const card of results) {
        const setId = setIdOf(card)
        const sim = nameSimilarity(stripLangTag(q.name), card.name)
        const num = sameNumber(q.card_number, card.localId)
        const set = expectedSet !== null && setId === expectedSet
        if (sim < MIN_NAME_SIMILARITY && !num) continue
        const score = sim * 3 + (num ? 3 : 0) + (set ? 2 : 0)
        const reason = num && set ? 'Set en nummer kloppen' : num ? 'Naam en nummer kloppen, andere set' : set ? 'Zelfde set, ander nummer' : 'Naam lijkt erop'
        add(card, setId, score, reason)
      }
      if (byKey.size >= MAX_CANDIDATES) break
    }
  }

  const sets = await getSetList(lang).catch((err: unknown) => {
    console.error('Setlijst ophalen mislukt', err)
    return new Map<string, { name: string }>()
  })
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({ ...c, setName: sets.get(c.setId)?.name ?? c.setId }))
}

/**
 * Koppelt automatisch alleen bij zekerheid: set + nummer kloppen én (voor Engels) de naam lijkt erop.
 * Geeft nieuwe objecten terug; twijfelgevallen houden tcgdex_id null.
 */
export async function resolveTcgdexIds<T extends ItemInput>(items: readonly T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (it) => {
      if (it.kind !== 'card' || !it.set_code || !it.card_number) return it
      try {
        const lang = langFromName(it.name)
        const card = await findExact(lang, it.set_code, it.card_number)
        if (!card) return it
        if (lang === 'en' && nameSimilarity(stripLangTag(it.name), card.name) < MIN_NAME_SIMILARITY) return it
        return { ...it, tcgdex_id: card.key }
      } catch (err) {
        console.error(`Koppelen mislukt voor ${it.name}`, err)
        return it
      }
    }),
  )
}
