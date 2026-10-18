const API = 'https://api.tcgdex.net/v2'

import type { CardLanguage, Variant } from './types'
import { parseCardGame, type CardGame } from './cardGame'
import { parseTcgplayer, type TcgplayerPrice } from './valuation'
import { parseDexId, parseRarity, parseSuffix, parseTypes, type EnergyType } from './cardTraits'
import { isLocalKey, localCardInfo, localSet, localSetIdForAbbr, localSetSummaries, searchLocal } from './localCatalog'

/** Talen met eigen sets/nummering in TCGdex. */
export const LANGS = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'] as const
export type Lang = (typeof LANGS)[number]

/**
 * Sets die in een taal echt gedrukt zijn, als dat er maar een paar zijn (Engelse set-id's).
 * Nederlands: alleen Base Set, Jungle en Fossil; daarna verscheen alles in Nederland in het Engels.
 */
export const PRINTED_SETS: Partial<Record<CardLanguage, ReadonlySet<string>>> = {
  nl: new Set(['base1', 'base2', 'base3']),
}

/** Kaarttaal → TCGdex-dataset. Europese talen delen set en nummer met de Engelse versie. */
export function lookupLang(language: CardLanguage | null): Lang {
  return language && isLang(language) ? language : 'en'
}

export interface SetCard {
  id: string
  localId: string
  name: string
  image: string | null
}

export interface SetSummary {
  id: string
  name: string
  logo: string | null
  /** Officiële afkorting (MEW, OBF); alleen bekend na ophalen van de setdetails. */
  abbr?: string | null
  /** Totaal aantal kaarten incl. secret rares; alleen bekend na ophalen van de setdetails. */
  total?: number
  /** Officiële telling (zonder secret rares); alleen bekend na ophalen van de setdetails. */
  official?: number | null
  releaseDate?: string | null
  /** Serie-id (bv. "SV"), nodig om een plaatjes-URL af te leiden. */
  serieId?: string | null
}

/** Weergave-info van één kaart. `key` = "<taal>/<kaart-id>", zoals opgeslagen in tcgdex_id. */
export interface CardInfo {
  key: string
  lang: Lang
  name: string
  localId: string
  image: string | null
  /** TCGplayer-productnummer (als TCGdex het kent), voor een extra plaatjesbron. */
  tcgplayerId?: number | null
  /** Uitvoeringen die volgens TCGdex bestaan; null = onbekend (dan alles toestaan). */
  variants?: Variant[] | null
  /** Illustrator volgens de catalogus; null = onbekend. */
  illustrator?: string | null
  /** Zeldzaamheid zoals TCGdex hem noemt (bv. "Double rare"); null = onbekend. */
  rarity?: string | null
  /** Energietypes; leeg bij trainers en energie. */
  types?: EnergyType[]
  /** Kaarttype-achtervoegsel: ex, V, VMAX …; null = geen. */
  suffix?: string | null
  /** Pokédex-nummer van de Pokémon op de kaart; null bij trainers en energie. */
  dexId?: number | null
  /** HP, aanvallen, zwakte enz. (sinds cache v7). */
  game?: CardGame | null
  set: SetSummary
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const optStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

// Beperkt gelijktijdige requests zodat een lijst van 100 kaarten de API niet bestookt.
const MAX_CONCURRENT = 6
let active = 0
const waiting: (() => void)[] = []

async function getJson(url: string): Promise<unknown> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    const res = await fetch(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`TCGdex ${res.status} voor ${url}`)
    return await res.json()
  } finally {
    active--
    waiting.shift()?.()
  }
}

function memo<T>(fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key) => {
    let p = cache.get(key)
    if (!p) {
      p = fn(key)
      // Mislukte requests niet cachen, zodat opnieuw proberen kan.
      p.catch(() => cache.delete(key))
      cache.set(key, p)
    }
    return p
  }
}

function parseCards(list: unknown): SetCard[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((c: unknown) =>
    isRecord(c) && typeof c.id === 'string' && typeof c.localId === 'string'
      ? [{ id: c.id, localId: c.localId, name: typeof c.name === 'string' ? c.name : '', image: optStr(c.image) }]
      : [],
  )
}

export function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v)
}

export function splitKey(key: string): { lang: Lang; cardId: string } | null {
  const i = key.indexOf('/')
  if (i < 1) return null
  const lang = key.slice(0, i)
  const cardId = key.slice(i + 1)
  return isLang(lang) && cardId ? { lang, cardId } : null
}

/** Set-id uit een opgeslagen sleutel ("en/sv03.5-151" → { lang: "en", setId: "sv03.5", cardId }). */
export function setOfKey(key: string): { lang: Lang; setId: string; cardId: string } | null {
  const parts = splitKey(key)
  if (!parts) return null
  const dash = parts.cardId.lastIndexOf('-')
  return dash > 0 ? { ...parts, setId: parts.cardId.slice(0, dash) } : null
}

/** Set-id uit kaart-id ("sv03.5-151" → "sv03.5"). */
export function setIdOf(card: Pick<SetCard, 'id' | 'localId'>): string {
  return card.id.slice(0, card.id.length - card.localId.length - 1)
}

/** Taal uit de naam afleiden: de Excel markeert buitenlandse kaarten met "JAPAN" / "CHINA". */
export function langFromName(name: string): Lang {
  if (/\bjapan\b/i.test(name)) return 'ja'
  if (/\bchina\b/i.test(name)) return 'zh-cn'
  return 'en'
}

export function stripLangTag(name: string): string {
  return name.replace(/\b(japan|china)\b/gi, '').replace(/\s+/g, ' ').trim()
}

const fetchSet = memo(async (k: string): Promise<{ summary: SetSummary; cards: SetCard[] } | null> => {
  const [lang, setId] = k.split('|')
  // Sets die TCGdex niet kent (Pokémon TCG Classic): uit de eigen catalogus.
  const local = lang === 'en' ? localSet(setId) : null
  if (local) return local
  const data = await getJson(`${API}/${lang}/sets/${encodeURIComponent(setId)}`)
  if (!isRecord(data) || typeof data.id !== 'string') return null
  const cards = parseCards(data.cards)
  const countTotal = isRecord(data.cardCount) && typeof data.cardCount.total === 'number' ? data.cardCount.total : 0
  const countOfficial = isRecord(data.cardCount) && typeof data.cardCount.official === 'number' ? data.cardCount.official : null
  return {
    summary: {
      id: data.id,
      name: typeof data.name === 'string' ? data.name : data.id,
      logo: optStr(data.logo),
      abbr: isRecord(data.abbreviation) ? optStr(data.abbreviation.official) : null,
      // Sommige sets (bv. Chinese) hebben een telling maar geen kaartenlijst.
      total: Math.max(countTotal, cards.length),
      official: countOfficial,
      releaseDate: optStr(data.releaseDate),
      serieId: isRecord(data.serie) ? optStr(data.serie.id) : null,
    },
    cards,
  }
})

export function getSet(lang: Lang, setId: string): Promise<{ summary: SetSummary; cards: SetCard[] } | null> {
  return fetchSet(`${lang}|${setId}`)
}

/** Setcode uit de Excel → TCGdex set-id. Engels via officiële afkorting (MEW, OBF), anders het id zelf. */
const fetchSetId = memo(async (k: string): Promise<string | null> => {
  const [lang, code] = k.split('|')
  if (lang !== 'en') return (await getSet(lang as Lang, code))?.summary.id ?? null
  const local = localSetIdForAbbr(code)
  if (local) return local
  const found = await getJson(`${API}/en/sets?abbreviation.official=eq:${encodeURIComponent(code)}`)
  if (!Array.isArray(found) || found.length !== 1 || !isRecord(found[0]) || typeof found[0].id !== 'string') return null
  return found[0].id
})

export function resolveSetId(lang: Lang, code: string): Promise<string | null> {
  // Japanse set-ids zijn hoofdlettergevoelig (bv. "S8b"); Engelse afkortingen niet.
  return fetchSetId(`${lang}|${lang === 'en' ? code.trim().toUpperCase() : code.trim()}`)
}

const fetchSetList = memo(async (lang: string): Promise<Map<string, SetSummary>> => {
  const data = await getJson(`${API}/${lang}/sets`)
  const map = new Map<string, SetSummary>()
  if (Array.isArray(data)) {
    for (const s of data) {
      if (isRecord(s) && typeof s.id === 'string') {
        const total = isRecord(s.cardCount) && typeof s.cardCount.total === 'number' ? s.cardCount.total : undefined
        const official = isRecord(s.cardCount) && typeof s.cardCount.official === 'number' ? s.cardCount.official : null
        map.set(s.id, { id: s.id, name: typeof s.name === 'string' ? s.name : s.id, logo: optStr(s.logo), total, official })
      }
    }
  }
  if (lang === 'en') for (const s of localSetSummaries()) map.set(s.id, s)
  return map
})

export function getSetList(lang: Lang): Promise<Map<string, SetSummary>> {
  return fetchSetList(lang)
}

const fetchSeriesSetIds = memo(async (k: string): Promise<Set<string>> => {
  const [lang, serie] = k.split('|')
  const data = await getJson(`${API}/${lang}/series/${encodeURIComponent(serie)}`)
  const ids = new Set<string>()
  if (isRecord(data) && Array.isArray(data.sets)) {
    for (const s of data.sets) if (isRecord(s) && typeof s.id === 'string') ids.add(s.id)
  }
  return ids
})

/** Sets van het digitale TCG Pocket (geen fysieke kaarten); alleen in de Engelse data. */
export async function digitalSetIds(lang: Lang): Promise<Set<string>> {
  if (lang !== 'en') return new Set()
  return fetchSeriesSetIds('en|tcgp').catch((err: unknown) => {
    console.warn('TCG Pocket-sets ophalen mislukt', err)
    return new Set<string>()
  })
}

/** Filters die TCGdex zelf toepast (exacte waarden, zoals TCGdex ze noemt); leeg = geen filter. */
export interface CardQueryFilters {
  rarity?: string
  type?: string
  suffix?: string
}

/** "Rare Holo" en "Holo Rare" zijn dezelfde zeldzaamheid; TCGdex gebruikt allebei. */
const RARITY_ALIASES: Record<string, string> = { 'Rare Holo': 'Rare Holo|Holo Rare' }

/** Zoekparameters voor TCGdex: naam (bevat) plus exacte filters. Japans e.d. kennen geen achtervoegsel-veld. */
export function cardQuery(lang: Lang, name: string, filters: CardQueryFilters = {}): string {
  const params: string[] = []
  const q = name.trim()
  if (q) params.push(`name=${encodeURIComponent(q)}`)
  if (filters.rarity) params.push(`rarity=eq:${encodeURIComponent(RARITY_ALIASES[filters.rarity] ?? filters.rarity)}`)
  if (filters.type) params.push(`types=eq:${encodeURIComponent(filters.type)}`)
  if (filters.suffix && lang === 'en') params.push(`suffix=eq:${encodeURIComponent(filters.suffix)}`)
  return params.join('&')
}

/**
 * Kaarten op naam (bevat, hoofdletterongevoelig) en/of filters; zonder digitale Pocket-kaarten.
 * Zonder naam alleen als er een filter is (bladeren, bv. alle ACE SPEC-kaarten).
 */
export async function searchCards(lang: Lang, name: string, filters: CardQueryFilters = {}): Promise<SetCard[]> {
  const q = name.trim()
  const filtered = Boolean(filters.rarity || filters.type || filters.suffix)
  if (q.length < 2 && !(q.length === 0 && filtered)) return []
  const [cards, digital] = await Promise.all([getJson(`${API}/${lang}/cards?${cardQuery(lang, q, filters)}`).then(parseCards), digitalSetIds(lang)])
  // Buiten het Engels geen achtervoegsel-veld: dan op de naam ("リザードンex").
  const suffix = lang !== 'en' && filters.suffix ? filters.suffix : null
  // Eigen catalogus (Engels) erbij, alleen op naam: zeldzaamheid en achtervoegsel kent hij niet.
  const local = lang === 'en' && !filters.rarity && !filters.suffix ? searchLocal(q, filters.type) : []
  return [...cards.filter((c) => !digital.has(setIdOf(c)) && (!suffix || c.name.endsWith(suffix))), ...local]
}

export function matchNumber(cards: readonly SetCard[], number: string): SetCard | undefined {
  const exact = cards.find((c) => c.localId === number)
  if (exact) return exact
  const n = Number.parseInt(number, 10)
  if (Number.isNaN(n)) return undefined
  const numeric = cards.filter((c) => Number.parseInt(c.localId, 10) === n)
  return numeric.length === 1 ? numeric[0] : undefined
}

// --- Kaartinfo en prijzen, met cache in localStorage ---

const INFO_PREFIX = 'tcgdex:card:v7:' // v7: met spelgegevens (HP, aanvallen, zwakte)
const INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000 // namen/plaatjes veranderen zelden
const PRICE_PREFIX = 'tcgdex:price:v2:' // v2: met idProduct
const PRICE_TTL_MS = 6 * 60 * 60 * 1000 // TCGdex ververst prijzen dagelijks

export function readCache<T>(prefix: string, ttl: number, key: string): T | null {
  try {
    const raw = localStorage.getItem(prefix + key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.t !== 'number' || Date.now() - parsed.t > ttl) return null
    return parsed.v as T
  } catch {
    return null // Geen opslag beschikbaar of corrupte cache: gewoon opnieuw ophalen.
  }
}

export function writeCache(prefix: string, key: string, v: unknown): void {
  try {
    localStorage.setItem(prefix + key, JSON.stringify({ t: Date.now(), v }))
  } catch (err) {
    console.warn('Cache opslaan mislukt', err)
  }
}

const GRAPHQL = 'https://api.tcgdex.net/v2/graphql'
const RARITY_PREFIX = 'tcgdex:set-rarity:v1:'
const RARITY_PAGE = 100 // TCGdex geeft maximaal 100 kaarten per pagina

/** Zeldzaamheid van alle kaarten van een (Engelse) set: kaart-id → zeldzaamheid. Een paar verzoeken i.p.v. één per kaart. */
const fetchSetRarities = memo(async (setId: string): Promise<Record<string, string | null>> => {
  const cached = readCache<Record<string, string | null>>(RARITY_PREFIX, INFO_TTL_MS, setId)
  if (cached) return cached
  const prefix = `${setId}-`
  const out: Record<string, string | null> = {}
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query ($id: ID, $page: Int!) { cards(filters: { id: $id }, pagination: { page: $page, count: 100 }) { id rarity } }',
        variables: { id: prefix, page },
      }),
    })
    if (!res.ok) throw new Error(`TCGdex GraphQL ${res.status}`)
    const json: unknown = await res.json()
    const list = isRecord(json) && isRecord(json.data) ? json.data.cards : null
    if (!Array.isArray(list)) throw new Error('TCGdex GraphQL: unexpected answer')
    // Het id-filter zoekt op tekst: alleen kaarten die echt met "<set-id>-" beginnen.
    for (const c of list) if (isRecord(c) && typeof c.id === 'string' && c.id.startsWith(prefix)) out[c.id] = optStr(c.rarity)
    if (list.length < RARITY_PAGE) break
  }
  writeCache(RARITY_PREFIX, setId, out)
  return out
})

/**
 * Zeldzaamheid per kaart-id voor een hele set in één keer (7 dagen bewaard). Alleen Engels: de GraphQL-API van
 * TCGdex kent geen andere talen; dan null en haalt de aanroeper de kaartinfo per kaart op.
 */
export async function getSetRarities(lang: Lang, setId: string): Promise<ReadonlyMap<string, string | null> | null> {
  if (lang !== 'en') return null
  return new Map(Object.entries(await fetchSetRarities(setId)))
}

const ABBR_PREFIX = 'tcgdex:abbr:v1:'
const ABBR_TTL_MS = 30 * 24 * 60 * 60 * 1000 // afkortingen veranderen niet

/** Officiële setafkorting (TEF, 30C); null als de set er geen heeft. Lokaal bewaard: het kost een volledige setdetail-request. */
export async function getSetAbbr(lang: Lang, setId: string): Promise<string | null> {
  const key = `${lang}|${setId}`
  const cached = readCache<string | 'none'>(ABBR_PREFIX, ABBR_TTL_MS, key)
  if (cached) return cached === 'none' ? null : cached
  const abbr = (await getSet(lang, setId))?.summary.abbr ?? null
  writeCache(ABBR_PREFIX, key, abbr ?? 'none')
  return abbr
}

/** Kaartdetails uit de API; één request per kaart per sessie, gedeeld door info en prijs. */
const fetchCardRaw = memo(async (key: string): Promise<Record<string, unknown> | null> => {
  const parts = splitKey(key)
  // Eigen catalogus: TCGdex kent de kaart niet (en heeft dus ook geen prijs).
  if (!parts || isLocalKey(key)) return null
  const data = await getJson(`${API}/${parts.lang}/cards/${encodeURIComponent(parts.cardId)}`)
  return isRecord(data) ? data : null
})

/** Cardmarket-prijzen in EUR. `null` = geen data. "Holo"-velden zijn de reverse-holoprijzen. */
export interface CardmarketPrice {
  /** Cardmarket-product-id, voor een directe link naar de productpagina. */
  idProduct: number | null
  updated: string | null
  trend: number | null
  low: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  trendHolo: number | null
  lowHolo: number | null
  avg1Holo: number | null
  avg7Holo: number | null
  avg30Holo: number | null
}

/** Positief getal of null (TCGdex gebruikt 0 voor "geen data"). */
const priceNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function parseCardmarket(data: Record<string, unknown>): CardmarketPrice | null {
  const cm = isRecord(data.pricing) && isRecord(data.pricing.cardmarket) ? data.pricing.cardmarket : null
  if (!cm || (typeof cm.unit === 'string' && cm.unit !== 'EUR')) return null
  return {
    idProduct: typeof cm.idProduct === 'number' && Number.isInteger(cm.idProduct) && cm.idProduct > 0 ? cm.idProduct : null,
    updated: optStr(cm.updated),
    trend: priceNum(cm.trend),
    low: priceNum(cm.low),
    avg1: priceNum(cm.avg1),
    avg7: priceNum(cm.avg7),
    avg30: priceNum(cm.avg30),
    trendHolo: priceNum(cm['trend-holo']),
    lowHolo: priceNum(cm['low-holo']),
    avg1Holo: priceNum(cm['avg1-holo']),
    avg7Holo: priceNum(cm['avg7-holo']),
    avg30Holo: priceNum(cm['avg30-holo']),
  }
}

const fetchCardPrice = memo(async (key: string): Promise<CardmarketPrice | null> => {
  const cached = readCache<CardmarketPrice | 'none'>(PRICE_PREFIX, PRICE_TTL_MS, key)
  if (cached) return cached === 'none' ? null : cached
  const data = await fetchCardRaw(key)
  const price = data ? parseCardmarket(data) : null
  writeCache(PRICE_PREFIX, key, price ?? 'none')
  return price
})

export function getCardPrice(key: string): Promise<CardmarketPrice | null> {
  return fetchCardPrice(key)
}

const TCGP_PREFIX = 'tcgdex:tcgp:v1:'

const fetchTcgplayer = memo(async (key: string): Promise<TcgplayerPrice | null> => {
  const cached = readCache<TcgplayerPrice | 'none'>(TCGP_PREFIX, PRICE_TTL_MS, key)
  if (cached) return cached === 'none' ? null : cached
  const data = await fetchCardRaw(key)
  const price = data ? parseTcgplayer(data) : null
  writeCache(TCGP_PREFIX, key, price ?? 'none')
  return price
})

/** TCGplayer-prijzen (VS, USD) via TCGdex; apart van Cardmarket, nooit omgerekend. */
export function getTcgplayerPrice(key: string): Promise<TcgplayerPrice | null> {
  return fetchTcgplayer(key)
}

/** TCGplayer-productnummer uit variants_detailed[].thirdParty.tcgplayer. */
export function findTcgplayerId(data: Record<string, unknown>): number | null {
  if (!Array.isArray(data.variants_detailed)) return null
  for (const v of data.variants_detailed) {
    const id = isRecord(v) && isRecord(v.thirdParty) ? v.thirdParty.tcgplayer : null
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id
  }
  return null
}

const VARIANT_KEYS: readonly Variant[] = ['normal', 'holo', 'reverse', 'firstEdition']

/**
 * Bestaande uitvoeringen uit het TCGdex-object `variants` (bv. { normal: false, holo: true, reverse: false }).
 * Ontbreekt het object of staat alles op false, dan null: onbekend, geen beperking.
 */
export function parseVariants(data: Record<string, unknown>): Variant[] | null {
  const v = data.variants
  if (!isRecord(v)) return null
  const list = VARIANT_KEYS.filter((k) => v[k] === true)
  return list.length > 0 ? list : null
}

const fetchCardInfo = memo(async (key: string): Promise<CardInfo | null> => {
  const local = localCardInfo(key)
  if (local) return local
  const cached = readCache<CardInfo>(INFO_PREFIX, INFO_TTL_MS, key)
  if (cached) return cached
  const parts = splitKey(key)
  if (!parts) return null
  const data = await fetchCardRaw(key)
  if (!data || typeof data.id !== 'string' || !isRecord(data.set) || typeof data.set.id !== 'string') return null

  const localId = typeof data.localId === 'string' ? data.localId : ''
  let image = optStr(data.image)
  let logo = optStr(data.set.logo)
  if (!image || !logo) {
    // Japanse/Chinese kaartdetails missen soms het plaatje; de setlijst heeft het wel.
    const set = await getSet(parts.lang, data.set.id)
    image ??= set?.cards.find((c) => c.id === data.id)?.image ?? null
    // Laatste poging: het plaatje bestaat soms wel op de CDN terwijl de API het niet noemt.
    // Bestaat het niet, dan valt CardImage via onError terug op "Geen foto".
    if (!image && set?.summary.serieId && localId) {
      image = `https://assets.tcgdex.net/${parts.lang}/${set.summary.serieId}/${data.set.id}/${localId}`
    }
    logo ??= set?.summary.logo ?? null
  }
  const info: CardInfo = {
    key,
    lang: parts.lang,
    name: typeof data.name === 'string' ? data.name : '',
    localId,
    image,
    tcgplayerId: findTcgplayerId(data),
    variants: parseVariants(data),
    illustrator: typeof data.illustrator === 'string' && data.illustrator.trim() ? data.illustrator.trim() : null,
    rarity: parseRarity(data.rarity),
    types: parseTypes(data.types),
    suffix: parseSuffix(data.suffix),
    dexId: parseDexId(data.dexId),
    game: parseCardGame(data),
    set: { id: data.set.id, name: typeof data.set.name === 'string' ? data.set.name : data.set.id, logo },
  }
  writeCache(INFO_PREFIX, key, info)
  return info
})

export function getCardInfo(key: string): Promise<CardInfo | null> {
  return fetchCardInfo(key)
}

export async function findExact(
  lang: Lang,
  setCode: string,
  number: string,
): Promise<(SetCard & { key: string; setId: string }) | null> {
  const setId = await resolveSetId(lang, setCode)
  if (!setId) return null
  const set = await getSet(lang, setId)
  const card = set ? matchNumber(set.cards, number) : undefined
  return card ? { ...card, key: `${lang}/${card.id}`, setId } : null
}
