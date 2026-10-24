import type { Lang } from './tcgdex'

/**
 * Vertaalt Engelse Pokémon-namen naar de taal van de kaart via PokeAPI (Pokédex-soorten).
 * Alleen Pokémon; trainer- en itemkaarten hebben geen vertaling en vallen terug op de ingevoerde naam.
 */

const POKEAPI = 'https://pokeapi.co/api/v2/pokemon-species/'

/** PokeAPI-taalsleutels per TCGdex-taal, in volgorde van voorkeur. */
const NAME_KEYS: Record<Lang, string[]> = {
  en: ['en'],
  ja: ['ja-hrkt', 'ja'],
  'zh-cn': ['zh-hans'],
  'zh-tw': ['zh-hant'],
  ko: ['ko'],
}

const CACHE_PREFIX = 'pokeapi:names:v1:'
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // namen veranderen niet

const PREFIXES = /^(mega|radiant|shining|alolan|galarian|hisuian|paldean|dark|light|team rocket's)\s+/i
const SUFFIXES = /\s+(ex|gx|v|vmax|vstar|v-union|break|prime|star|lv\.?\s?x|δ|◇|x|y)$/i

/** "Lillie's Clefairy ex" → "clefairy", "Mr. Mime" → "mr-mime", "Nidoran♀" → "nidoran-f". */
export function speciesSlug(name: string): string {
  let n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(japan|china)\b/gi, '')
    .trim()
  n = n.replace(/^[A-Za-z]+'s\s+/, '') // eigenaar: "Misty's Psyduck"
  for (let i = 0; i < 3; i++) n = n.replace(PREFIXES, '').replace(SUFFIXES, '').trim()
  return n
    .toLowerCase()
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/[.'’:]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function readCache(slug: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { t, v } = parsed as { t?: unknown; v?: unknown }
    if (typeof t !== 'number' || Date.now() - t > CACHE_TTL_MS || typeof v !== 'object' || v === null) return null
    return v as Record<string, string>
  } catch {
    return null // geen opslag beschikbaar: gewoon opnieuw ophalen
  }
}

function writeCache(slug: string, v: Record<string, string>): void {
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ t: Date.now(), v }))
  } catch (err) {
    console.warn('Namencache opslaan mislukt', err)
  }
}

async function fetchNames(slug: string): Promise<Record<string, string> | null> {
  const cached = readCache(slug)
  if (cached) return cached
  const res = await fetch(POKEAPI + encodeURIComponent(slug))
  if (res.status === 404) {
    writeCache(slug, {}) // onbekend: niet steeds opnieuw vragen
    return {}
  }
  if (!res.ok) throw new Error(`PokeAPI ${res.status}`)
  const data: unknown = await res.json()
  const names: Record<string, string> = {}
  if (typeof data === 'object' && data !== null && Array.isArray((data as { names?: unknown }).names)) {
    for (const entry of (data as { names: unknown[] }).names) {
      if (typeof entry !== 'object' || entry === null) continue
      const { name, language } = entry as { name?: unknown; language?: { name?: unknown } }
      if (typeof name === 'string' && typeof language?.name === 'string') names[language.name] = name
    }
  }
  writeCache(slug, names)
  return names
}

const inflight = new Map<string, Promise<Record<string, string> | null>>()

/** Naam in de taal van de kaart, of null als er geen vertaling is (bv. trainerkaarten). */
export async function translateName(englishName: string, lang: Lang): Promise<string | null> {
  if (lang === 'en') return null
  const slug = speciesSlug(englishName)
  if (!slug) return null
  let p = inflight.get(slug)
  if (!p) {
    p = fetchNames(slug).catch((err: unknown) => {
      console.error(`Vertaling ophalen mislukt voor ${slug}`, err)
      inflight.delete(slug)
      return null
    })
    inflight.set(slug, p)
  }
  const names = await p
  if (!names) return null
  for (const key of NAME_KEYS[lang]) if (names[key]) return names[key]
  return null
}

/** Bevat de tekst al niet-Latijnse tekens (de gebruiker typte zelf Japans/Chinees/Koreaans)? */
export const isNonLatin = (s: string): boolean => /[^ -ɏ\s\d.'’:♀♂-]/.test(s)

export interface Species {
  dexId: number
  name: string
}

/** PokeAPI-naam die niet met hoofdletters per woord goed komt. */
const SPECIES_NAMES: Record<string, string> = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'mr-mime': 'Mr. Mime',
  'mime-jr': 'Mime Jr.',
  'mr-rime': 'Mr. Rime',
  farfetchd: "Farfetch'd",
  sirfetchd: "Sirfetch'd",
  'type-null': 'Type: Null',
  flabebe: 'Flabébé',
}
/** Namen die hun streepje houden ("Ho-Oh", "Chi-Yu"). */
const HYPHENATED = /^(ho-oh|porygon-z|jangmo-o|hakamo-o|kommo-o|wo-chien|chien-pao|ting-lu|chi-yu)$/

/** "mr-mime" → "Mr. Mime", "ho-oh" → "Ho-Oh", "tapu-koko" → "Tapu Koko". */
export function speciesName(slug: string): string {
  if (SPECIES_NAMES[slug]) return SPECIES_NAMES[slug]
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)
  return HYPHENATED.test(slug) ? slug.split('-').map(cap).join('-') : slug.split('-').map(cap).join(' ')
}

/** PokeAPI-lijst van soorten → nummer en naam; onverwachte regels worden overgeslagen. */
export function toSpecies(data: unknown): Species[] {
  const results = typeof data === 'object' && data !== null && Array.isArray((data as { results?: unknown }).results) ? (data as { results: unknown[] }).results : []
  return results.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return []
    const { name, url } = r as { name?: unknown; url?: unknown }
    const id = typeof url === 'string' ? Number(/\/(\d+)\/?$/.exec(url)?.[1]) : NaN
    return typeof name === 'string' && Number.isInteger(id) && id >= 1 && id <= 1025 ? [{ dexId: id, name: speciesName(name) }] : []
  })
}

const SPECIES_KEY = 'pokeapi:species:v1'
let speciesPromise: Promise<Species[]> | null = null

function readSpecies(): Species[] | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SPECIES_KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return null
    const { t, list } = parsed as { t?: unknown; list?: unknown }
    if (typeof t !== 'number' || Date.now() - t > CACHE_TTL_MS || !Array.isArray(list)) return null
    const ok = list.filter((s): s is Species => typeof s === 'object' && s !== null && typeof (s as Species).dexId === 'number' && typeof (s as Species).name === 'string')
    return ok.length > 0 ? ok : null
  } catch {
    return null // geen opslag of kapotte waarde: opnieuw ophalen
  }
}

/** Alle Pokémon (1–1025) met Engelse naam, voor het Pokémon pack. Eén keer per 90 dagen opgehaald. */
export function speciesList(): Promise<Species[]> {
  speciesPromise ??= (async () => {
    const cached = readSpecies()
    if (cached) return cached
    const res = await fetch(`${POKEAPI}?limit=1025`)
    if (!res.ok) throw new Error(`PokeAPI ${res.status}`)
    const list = toSpecies(await res.json())
    if (list.length === 0) throw new Error('PokeAPI: empty list of Pokémon.')
    try {
      localStorage.setItem(SPECIES_KEY, JSON.stringify({ t: Date.now(), list }))
    } catch (err) {
      console.warn('Pokémon-lijst bewaren mislukt', err)
    }
    return list
  })().catch((err: unknown) => {
    speciesPromise = null
    throw err
  })
  return speciesPromise
}

/** Engelse soortnaam bij een Pokédex-nummer (25 → "Pikachu"), of null. Gedeelde cache met de vertalingen. */
export async function englishSpeciesName(dexId: number): Promise<string | null> {
  if (!Number.isInteger(dexId) || dexId < 1 || dexId > 2000) return null
  const key = String(dexId)
  let p = inflight.get(key)
  if (!p) {
    p = fetchNames(key).catch((err: unknown) => {
      console.error(`Soortnaam ophalen mislukt voor #${key}`, err)
      inflight.delete(key)
      return null
    })
    inflight.set(key, p)
  }
  return (await p)?.en ?? null
}
