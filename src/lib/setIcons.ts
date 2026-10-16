import { readCache, writeCache, type Lang } from './tcgdex'

/**
 * Logo's en symbolen van sets uit meerdere bronnen, omdat TCGdex er veel mist (geen symbolen,
 * geen logo's voor promo's, energie en alle Aziatische sets):
 * 1. TCGdex-logo, 2. pokemontcg.io (Engels, gezocht op setnaam), 3. Limitless-symbool
 *    (Engels op officiële afkorting, Japans op set-id).
 */

export interface PtcgImages {
  /** Set-id bij pokemontcg.io (bv. "sv5"), voor kaartfoto's. */
  id: string | null
  logo: string | null
  symbol: string | null
}

/** Genormaliseerde setnaam → plaatjes van pokemontcg.io. */
export type PtcgSets = ReadonlyMap<string, PtcgImages>

const PTCG_API = 'https://api.pokemontcg.io/v2/sets?pageSize=250&select=id,name,images'
const PTCG_PREFIX = 'ptcg:sets:v2:' // v2: met set-id
const PTCG_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PTCG_ATTEMPTS = 5
const LIMITLESS = 'https://s3.limitlesstcg.com/sets'

/** TCGdex-set-id → naam bij pokemontcg.io, waar die afwijkt. */
const PTCG_ALIASES: Record<string, string> = {
  svp: 'Scarlet & Violet Black Star Promos',
  sve: 'Scarlet & Violet Energies',
  '30th-c': '30th Celebration: Classic Collection',
}

export const normSetName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null)

/** Antwoord van pokemontcg.io → plaatjes per genormaliseerde setnaam. */
export function parsePtcgSets(data: unknown): Map<string, PtcgImages> {
  const out = new Map<string, PtcgImages>()
  const list = typeof data === 'object' && data !== null && Array.isArray((data as { data?: unknown }).data) ? (data as { data: unknown[] }).data : []
  for (const s of list) {
    if (typeof s !== 'object' || s === null) continue
    const { id, name, images } = s as { id?: unknown; name?: unknown; images?: unknown }
    if (typeof name !== 'string' || typeof images !== 'object' || images === null) continue
    const img = images as { logo?: unknown; symbol?: unknown }
    const entry = { id: typeof id === 'string' && /^[a-z0-9]+$/i.test(id) ? id : null, logo: httpsUrl(img.logo), symbol: httpsUrl(img.symbol) }
    if (entry.logo || entry.symbol) out.set(normSetName(name), entry)
  }
  return out
}

let ptcgPromise: Promise<PtcgSets> | null = null

/** Setlijst van pokemontcg.io, een week lokaal bewaard. Mislukt het, dan een lege lijst (later opnieuw). */
export function getPtcgSets(): Promise<PtcgSets> {
  ptcgPromise ??= (async () => {
    const cached = readCache<[string, PtcgImages][]>(PTCG_PREFIX, PTCG_TTL_MS, 'all')
    if (cached) return new Map(cached)
    // De API geeft vaak een losse 500/502 (gemeten: 4 van 6); daarom een paar keer proberen.
    let lastError: unknown = null
    for (let attempt = 0; attempt < PTCG_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1000))
      try {
        const res = await fetch(PTCG_API)
        if (!res.ok) throw new Error(`pokemontcg.io ${res.status}`)
        const sets = parsePtcgSets(await res.json())
        writeCache(PTCG_PREFIX, 'all', [...sets])
        return sets
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  })().catch((err: unknown) => {
    console.warn('Setlijst van pokemontcg.io ophalen mislukt', err)
    ptcgPromise = null
    return new Map<string, PtcgImages>()
  })
  return ptcgPromise
}

export function ptcgImagesFor(sets: PtcgSets | null | undefined, setId: string, name: string): PtcgImages | null {
  if (!sets) return null
  return sets.get(normSetName(PTCG_ALIASES[setId] ?? name)) ?? null
}

/** Limitless-symbool: Engels op officiële afkorting (TEF), Japans op set-id (SV8). */
export function limitlessSymbol(lang: Lang, setId: string, abbr: string | null | undefined): string | null {
  if (lang === 'en') return abbr && /^[A-Za-z0-9]+$/.test(abbr) ? `${LIMITLESS}/en/${abbr.toUpperCase()}_SM.png` : null
  if (lang === 'ja') return /^[A-Za-z0-9.+-]+$/.test(setId) ? `${LIMITLESS}/jp/${setId}.png` : null
  return null
}

export interface SetRef {
  lang: Lang
  setId: string
  name: string
  /** TCGdex-logo zonder extensie, of null. */
  logo: string | null
}

/** Groot beeld (Sets-pagina): logo's eerst, symbool als laatste redmiddel. Zonder Limitless (heeft afkorting nodig). */
export function setLogoSources(set: SetRef, ptcg: PtcgSets | null | undefined): string[] {
  const p = set.lang === 'en' ? ptcgImagesFor(ptcg, set.setId, set.name) : null
  return [set.logo ? `${set.logo}.webp` : null, p?.logo ?? null].filter((u): u is string => u !== null)
}

/** Klein beeld (naast de setnaam): symbolen. Zonder Limitless (heeft afkorting nodig). */
export function setSymbolSources(set: SetRef, ptcg: PtcgSets | null | undefined): string[] {
  const p = set.lang === 'en' ? ptcgImagesFor(ptcg, set.setId, set.name) : null
  return p?.symbol ? [p.symbol] : []
}
