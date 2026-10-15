const API = 'https://api.tcgdex.net/v2'

export const LANGS = ['en', 'ja', 'zh-cn'] as const
export type Lang = (typeof LANGS)[number]

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
}

/** Weergave-info van één kaart. `key` = "<taal>/<kaart-id>", zoals opgeslagen in tcgdex_id. */
export interface CardInfo {
  key: string
  lang: Lang
  name: string
  localId: string
  image: string | null
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
  return {
    summary: {
      id: data.id,
      name: typeof data.name === 'string' ? data.name : data.id,
      logo: optStr(data.logo),
      abbr: isRecord(data.abbreviation) ? optStr(data.abbreviation.official) : null,
    },
    cards: parseCards(data.cards),
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
        map.set(s.id, { id: s.id, name: typeof s.name === 'string' ? s.name : s.id, logo: optStr(s.logo) })
      }
    }
  }
  return map
})

export function getSetList(lang: Lang): Promise<Map<string, SetSummary>> {
  return fetchSetList(lang)
}

/** Kaarten waarvan de naam de zoekterm bevat (hoofdletterongevoelig). */
export async function searchCards(lang: Lang, name: string): Promise<SetCard[]> {
  const q = name.trim()
  if (q.length < 2) return []
  return parseCards(await getJson(`${API}/${lang}/cards?name=${encodeURIComponent(q)}`))
}

export function matchNumber(cards: readonly SetCard[], number: string): SetCard | undefined {
  const exact = cards.find((c) => c.localId === number)
  if (exact) return exact
  const n = Number.parseInt(number, 10)
  if (Number.isNaN(n)) return undefined
  const numeric = cards.filter((c) => Number.parseInt(c.localId, 10) === n)
  return numeric.length === 1 ? numeric[0] : undefined
}

// --- Kaartinfo met cache in localStorage (namen/plaatjes veranderen zelden) ---

const CACHE_PREFIX = 'tcgdex:card:v1:'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function readCache(key: string): CardInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.t !== 'number' || Date.now() - parsed.t > CACHE_TTL_MS) return null
    return parsed.v as CardInfo
  } catch {
    return null // Geen opslag beschikbaar of corrupte cache: gewoon opnieuw ophalen.
  }
}

function writeCache(key: string, v: CardInfo): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }))
  } catch (err) {
    console.warn('Kaartcache opslaan mislukt', err)
  }
}

const fetchCardInfo = memo(async (key: string): Promise<CardInfo | null> => {
  const cached = readCache(key)
  if (cached) return cached
  const parts = splitKey(key)
  if (!parts) return null
  const data = await getJson(`${API}/${parts.lang}/cards/${encodeURIComponent(parts.cardId)}`)
  if (!isRecord(data) || typeof data.id !== 'string' || !isRecord(data.set) || typeof data.set.id !== 'string') return null

  const localId = typeof data.localId === 'string' ? data.localId : ''
  let image = optStr(data.image)
  let logo = optStr(data.set.logo)
  if (!image || !logo) {
    // Japanse/Chinese kaartdetails missen soms het plaatje; de setlijst heeft het wel.
    const set = await getSet(parts.lang, data.set.id)
    image ??= set?.cards.find((c) => c.id === data.id)?.image ?? null
    logo ??= set?.summary.logo ?? null
  }
  const info: CardInfo = {
    key,
    lang: parts.lang,
    name: typeof data.name === 'string' ? data.name : '',
    localId,
    image,
    set: { id: data.set.id, name: typeof data.set.name === 'string' ? data.set.name : data.set.id, logo },
  }
  writeCache(key, info)
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
