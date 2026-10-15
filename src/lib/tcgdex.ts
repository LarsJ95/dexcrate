const API = 'https://api.tcgdex.net/v2'

import type { CardLanguage, Variant } from './types'

/** Talen met eigen sets/nummering in TCGdex. */
export const LANGS = ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'] as const
export type Lang = (typeof LANGS)[number]

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

export function imageUrl(base: string | null, quality: 'low' | 'high'): string | null {
  return base ? `${base}/${quality}.webp` : null
}

/**
 * Japanse kaartfoto van Limitless TCG ("SV8_107_R_JP_SM.png", nummer zonder voorloopnullen).
 * Koreaanse en Traditioneel Chinese sets delen meestal setcode + nummer met de Japanse uitgave.
 */
export function limitlessJpUrl(setId: string, localId: string, quality: 'low' | 'high'): string | null {
  if (!/^\d+$/.test(localId) || !/^[A-Za-z0-9-]+$/.test(setId)) return null
  const n = String(Number.parseInt(localId, 10))
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${setId}/${setId}_${n}_R_JP_${quality === 'high' ? 'LG' : 'SM'}.png`
}

/** Mogelijke plaatjes-URL's in volgorde van voorkeur; de weergave probeert de volgende als er een faalt. */
/** Productfoto van TCGplayer op basis van het productnummer. */
export function tcgplayerImageUrl(productId: number | null | undefined, quality: 'low' | 'high'): string | null {
  if (!productId || !Number.isInteger(productId) || productId <= 0) return null
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${quality === 'high' ? '400w' : '200w'}.jpg`
}

/** Volgorde: TCGdex → Limitless (Aziatische talen) → TCGplayer. */
export function imageCandidates(
  lang: Lang,
  setId: string,
  localId: string,
  base: string | null,
  quality: 'low' | 'high',
  tcgplayerId?: number | null,
): string[] {
  const out: string[] = []
  const tcgdex = imageUrl(base, quality)
  if (tcgdex) out.push(tcgdex)
  if (lang === 'ja' || lang === 'zh-tw' || lang === 'ko') {
    const jp = limitlessJpUrl(setId, localId, quality)
    if (jp) out.push(jp)
  }
  const tcgplayer = tcgplayerImageUrl(tcgplayerId, quality)
  if (tcgplayer) out.push(tcgplayer)
  return out
}

/** Plaatjes voor een kaart-sleutel ("ja/SV8-107") zonder eerst de kaartdetails op te halen. */
export function imageCandidatesForKey(key: string, base: string | null, quality: 'low' | 'high'): string[] {
  const s = setOfKey(key)
  if (!s) return base ? [imageUrl(base, quality) as string] : []
  const localId = s.cardId.slice(s.setId.length + 1)
  return imageCandidates(s.lang, s.setId, localId, base, quality)
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
        map.set(s.id, { id: s.id, name: typeof s.name === 'string' ? s.name : s.id, logo: optStr(s.logo), total })
      }
    }
  }
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

/** Kaarten waarvan de naam de zoekterm bevat (hoofdletterongevoelig); zonder digitale Pocket-kaarten. */
export async function searchCards(lang: Lang, name: string): Promise<SetCard[]> {
  const q = name.trim()
  if (q.length < 2) return []
  const [cards, digital] = await Promise.all([
    getJson(`${API}/${lang}/cards?name=${encodeURIComponent(q)}`).then(parseCards),
    digitalSetIds(lang),
  ])
  return cards.filter((c) => !digital.has(setIdOf(c)))
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

const INFO_PREFIX = 'tcgdex:card:v4:' // v4: met uitvoeringen (variants)
const INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000 // namen/plaatjes veranderen zelden
const PRICE_PREFIX = 'tcgdex:price:v2:' // v2: met idProduct
const PRICE_TTL_MS = 6 * 60 * 60 * 1000 // TCGdex ververst prijzen dagelijks

function readCache<T>(prefix: string, ttl: number, key: string): T | null {
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

function writeCache(prefix: string, key: string, v: unknown): void {
  try {
    localStorage.setItem(prefix + key, JSON.stringify({ t: Date.now(), v }))
  } catch (err) {
    console.warn('Cache opslaan mislukt', err)
  }
}

/** Kaartdetails uit de API; één request per kaart per sessie, gedeeld door info en prijs. */
const fetchCardRaw = memo(async (key: string): Promise<Record<string, unknown> | null> => {
  const parts = splitKey(key)
  if (!parts) return null
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

/**
 * Link naar Cardmarket: de productpagina als het product-id bekend is, anders een zoekopdracht.
 * Formaat gebruikt door andere tools; door Cardmarkets botbescherming niet automatisch te controleren.
 */
export function cardmarketUrl(idProduct: number | null, searchText: string): string {
  if (idProduct) return `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${idProduct}`
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(searchText.trim())}`
}

export function getCardPrice(key: string): Promise<CardmarketPrice | null> {
  return fetchCardPrice(key)
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
