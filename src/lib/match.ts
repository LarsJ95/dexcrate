import { isNonLatin, translateName } from './names'
import { LANGUAGE_LABELS, type CardInput } from './types'
import {
  findExact,
  getSet,
  getSetList,
  lookupLang,
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
  /** Gekoppeld op set + nummer: TCGdex kent de set, maar heeft (nog) geen kaartenlijst (veel Japanse/Chinese sets). */
  noCardData?: boolean
  /** Het gelezen nummer past niet bij deze kaart (bv. een set die de catalogus niet kent): alleen een suggestie. */
  otherNumber?: boolean
  /** Set en nummer kloppen, maar de catalogus heeft daar een andere kaart (andere naam): alleen een suggestie. */
  nameDiffers?: boolean
  /** Je koos deze kaart eerder bij dezelfde lezing (zie scanMemory); staat daarom bovenaan. */
  remembered?: boolean
}

/** Kandidaat die de app zelf mag kiezen: de bovenste, behalve als het gelezen nummer of de naam daar niet bij past. */
export function autoPick(candidates: readonly Candidate[]): Candidate | null {
  const top = candidates[0]
  return top && !top.otherNumber && !top.nameDiffers ? top : null
}

export interface MatchQuery {
  name: string
  /** Naam zoals gedrukt (scan), in de taal van de kaart: om een set+nummer-match bij Aziatische kaarten te controleren. */
  name_printed?: string | null
  set_code: string | null
  card_number: string | null
  /** Getal na de schuine streep op de kaart ("165" bij 151/165): onderscheidt sets met dezelfde naam en hetzelfde nummer. */
  set_total?: string | null
}

/** Klopt het gedrukte totaal ("165") met de officiële grootte van de set? */
export function matchesSetTotal(official: number | null | undefined, printedTotal: string | null | undefined): boolean {
  const n = Number.parseInt(printedTotal ?? '', 10)
  return Number.isInteger(n) && n > 0 && official === n
}

/** Extra punten als het gedrukte totaal bij de set past: weegt minder dan een gelezen setcode (2), meer dan naamverschil. */
const SET_TOTAL_BONUS = 1.5

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

/** TCGdex-nummer zoals in zijn kaart-id's: cijfers met drie posities ("16" → "016"), anders ongewijzigd. */
export function catalogLocalId(number: string): string {
  const n = number.trim()
  return /^\d+$/.test(n) ? String(Number.parseInt(n, 10)).padStart(3, '0') : n
}

/** De scan verwart Vereenvoudigd en Traditioneel Chinees soms; dan ook in de andere taal zoeken. */
const SIBLING_LANG: Partial<Record<Lang, Lang>> = { 'zh-cn': 'zh-tw', 'zh-tw': 'zh-cn' }

/** Kern van een Aziatische kaartnaam: "玛俐的莫鲁贝可" → "莫鲁贝可", "太阳伊布ex" → "太阳伊布", "マリィのモルペコ" → "モルペコ". */
export function baseLocalName(name: string): string {
  let n = stripLangTag(name).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  n = n.replace(/(ex|gx|vmax|vstar|v-union|v|break)$/, '')
  const owner = Math.max(n.lastIndexOf('的'), n.lastIndexOf('の'))
  if (owner > 0 && owner < n.length - 1) n = n.slice(owner + 1)
  return n.replace(/^(超级|超級|メガ)/, '')
}

/** Aandeel gedeelde tekens (0–1): trainerkaarten in het andere Chinese schrift, "紧急滑板" ↔ "緊急滑板" = 0,75. */
function sharedChars(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  if (!x.length || !y.length) return 0
  const inB = new Set(y)
  return x.filter((ch) => inB.has(ch)).length / Math.max(x.length, y.length)
}

/** Onder dit aandeel gedeelde tekens is een trainerkaart een andere kaart. */
const MIN_SHARED_CHARS = 0.6

export type NameCheck = 'same' | 'differs' | 'unknown'

/**
 * Past de catalogusnaam van een Aziatische kaart bij de gelezen kaart? Vergelijkt met de vertaalde Pokémon-naam
 * (PokeAPI, beide Chinese schriften) en de gedrukte naam. Nodig omdat TCGdex onder Vereenvoudigd Chinees ook
 * Traditioneel-Chinese sets heeft (gecontroleerd 20-10-2026: SV8 #062 = 棄世猴, terwijl de scan Abra las).
 */
export async function checkLocalName(q: Pick<MatchQuery, 'name' | 'name_printed'>, lang: Lang, catalogName: string): Promise<NameCheck> {
  const typed = q.name.trim()
  // Eigen catalogus (bv. CSMC, Gem Packs) heeft Engelse namen: gewoon vergelijken met de Engelse naam.
  if (!isNonLatin(catalogName)) {
    if (!typed || isNonLatin(typed)) return 'unknown'
    return nameSimilarity(stripLangTag(typed), catalogName) >= MIN_NAME_SIMILARITY ? 'same' : 'differs'
  }
  const card = baseLocalName(catalogName)
  if (!card) return 'unknown'
  const langs = [lang, SIBLING_LANG[lang]].filter((l): l is Lang => l !== undefined)
  const translated = !typed
    ? []
    : isNonLatin(typed)
      ? [typed]
      : (await Promise.all(langs.map((l) => translateName(typed, l)))).filter((n): n is string => n !== null)
  const printed = q.name_printed?.trim() ?? ''
  if ([...translated, printed].some((n) => n && baseLocalName(n) === card)) return 'same'
  // Pokémon met een bekende vertaling: alleen dezelfde naam telt (來悲茶 is niet 來悲粗茶).
  if (translated.length > 0) return 'differs'
  // Trainer of item: de gedrukte naam kan in het andere schrift staan.
  if (printed) return sharedChars(baseLocalName(printed), card) >= MIN_SHARED_CHARS ? 'same' : 'differs'
  return 'unknown'
}

/**
 * Veel Japanse en Chinese sets staan wel in TCGdex, maar zonder kaartenlijst (gecontroleerd 18-10-2026: 68 van
 * 186 Japanse en 49 van 57 Chinese sets). Dan toch een kandidaat op set + nummer, zodat de kaart bij de set hoort;
 * foto via Limitless (Japans), geen catalogusprijs. Niet als het gedrukte totaal niet bij de set past.
 */
async function setNumberCandidate(lang: Lang, setId: string, q: MatchQuery): Promise<Omit<Candidate, 'setName'> | null> {
  if (!q.card_number?.trim()) return null
  const set = await getSet(lang, setId)
  if (!set || set.cards.length > 0) return null
  if (q.set_total && set.summary.official && !matchesSetTotal(set.summary.official, q.set_total)) return null
  const localId = catalogLocalId(q.card_number)
  return {
    key: `${lang}/${set.summary.id}-${localId}`,
    name: stripLangTag(q.name),
    localId,
    setId: set.summary.id,
    image: null,
    score: 8,
    reason: 'Set and number; no card data in the catalog for this set',
    noCardData: true,
  }
}

/**
 * Zoekt de meest aannemelijke TCGdex-kaarten voor een regel, ook bij typo's in naam, set of nummer.
 * Volgorde: exacte set+nummer, daarna naam+nummer elders, daarna gelijkende namen.
 */
export async function findCandidates(q: MatchQuery, lang: Lang): Promise<Candidate[]> {
  const byKey = new Map<string, Omit<Candidate, 'setName'>>()

  const readNumber = Boolean(q.card_number?.trim())
  const add = (card: SetCard, setId: string, score: number, reason: string, numberMatches: boolean, nameDiffers = false): void => {
    const key = `${lang}/${card.id}`
    const existing = byKey.get(key)
    if (!existing || existing.score < score) {
      byKey.set(key, {
        key,
        name: card.name,
        localId: card.localId,
        setId,
        image: card.image,
        score,
        reason,
        ...(readNumber && !numberMatches ? { otherNumber: true } : {}),
        ...(nameDiffers ? { nameDiffers: true } : {}),
      })
    }
  }

  const expectedSet = q.set_code ? await resolveSetId(lang, q.set_code) : null
  if (q.set_code && q.card_number) {
    const exact = await findExact(lang, q.set_code, q.card_number)
    if (exact && lang === 'en') {
      const sim = nameSimilarity(stripLangTag(q.name), exact.name)
      add(exact, exact.setId, 4 + sim * 4, sim >= MIN_NAME_SIMILARITY ? 'Set and number match' : 'Set and number match, name differs', true)
    } else if (exact) {
      // Andere naam op dit nummer: onder de kaarten die op naam gevonden worden, en nooit vanzelf gekozen.
      if ((await checkLocalName(q, lang, exact.name)) === 'differs') add(exact, exact.setId, 2, `Other card at this number: ${exact.name}`, true, true)
      else add(exact, exact.setId, 8, 'Set and number match', true)
    } else if (lang !== 'en' && expectedSet) {
      const loose = await setNumberCandidate(lang, expectedSet, q)
      if (loose) byKey.set(loose.key, loose)
    }
  }

  // Aziatische kaarten: Engelse naam vertalen (Morpeko → 莫鲁贝可), of zelf getypte naam direct gebruiken.
  if (lang !== 'en') {
    const typed = q.name.trim()
    const localName = isNonLatin(typed) ? typed : await translateName(typed, lang)
    if (localName) {
      for (const card of await searchCards(lang, localName)) {
        const setId = setIdOf(card)
        const num = sameNumber(q.card_number, card.localId)
        const set = expectedSet !== null && setId === expectedSet
        const score = 3 + (num ? 3 : 0) + (set ? 2 : 0)
        const reason = num && set ? 'Set and number match' : num ? `Name (${localName}) and number match` : set ? 'Same set' : readNumber ? `Name (${localName}), other number` : `Name: ${localName}`
        add(card, setId, score, reason, num)
      }
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
        const reason = num && set ? 'Set and number match' : num ? 'Name and number match, other set' : set ? 'Same set, other number' : 'Similar name'
        add(card, setId, score, reason, num)
      }
      if (byKey.size >= MAX_CANDIDATES) break
    }
  }

  const sets = await getSetList(lang).catch((err: unknown) => {
    console.error('Setlijst ophalen mislukt', err)
    return new Map<string, { name: string; official?: number | null }>()
  })
  // Zelfde naam en nummer in meerdere sets (bv. Charmeleon #5 in 151 én POP Series 5): het gedrukte totaal beslist.
  if (q.set_total) {
    for (const c of byKey.values()) {
      if (matchesSetTotal(sets.get(c.setId)?.official, q.set_total)) {
        c.score += SET_TOTAL_BONUS
        c.reason = c.reason === 'Name and number match, other set' ? 'Name, number and set size match' : `${c.reason}, set size matches`
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({ ...c, setName: sets.get(c.setId)?.name ?? c.setId }))
}

/**
 * Kandidaten voor een gescande kaart. Eerst in de gelezen taal; zit daar geen kaart met het gelezen nummer bij,
 * dan ook in de verwante taal (zh-cn ↔ zh-tw). Kaarten mét het nummer uit die taal komen bovenaan; suggesties
 * met een ander nummer alleen als de gelezen taal niets opleverde.
 */
export async function findScanCandidates(q: MatchQuery, lang: Lang): Promise<Candidate[]> {
  const first = await findCandidates(q, lang)
  const sibling = SIBLING_LANG[lang]
  if (!sibling || !q.card_number?.trim() || autoPick(first)) return first
  const other = (await findCandidates(q, sibling)).map((c) => ({ ...c, reason: `${c.reason} (${LANGUAGE_LABELS[sibling]})` }))
  const matches = other.filter((c) => !c.otherNumber)
  const extra = first.length === 0 ? other.filter((c) => c.otherNumber) : []
  return [...matches, ...first, ...extra].slice(0, MAX_CANDIDATES)
}

/**
 * Koppelt automatisch alleen bij zekerheid: set + nummer kloppen én (voor Engels) de naam lijkt erop.
 * Geeft nieuwe objecten terug; twijfelgevallen houden tcgdex_id null.
 */
export async function resolveTcgdexIds<T extends CardInput>(items: readonly T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (it) => {
      if (it.kind !== 'card' || !it.set_code || !it.card_number) return it
      try {
        const lang = lookupLang(it.language)
        const card = await findExact(lang, it.set_code, it.card_number)
        if (!card) return it
        if (lang === 'en' && nameSimilarity(stripLangTag(it.name), card.name) < MIN_NAME_SIMILARITY) return it
        if (lang !== 'en' && (await checkLocalName({ name: it.name }, lang, card.name)) === 'differs') return it
        return { ...it, tcgdex_id: card.key }
      } catch (err) {
        console.error(`Koppelen mislukt voor ${it.name}`, err)
        return it
      }
    }),
  )
}
