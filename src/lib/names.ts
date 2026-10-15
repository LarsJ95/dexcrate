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
