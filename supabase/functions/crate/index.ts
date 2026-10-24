// Supabase Edge Function: de Crate-game eerlijk (STAP23). Trekt pakjes zelf, zoekt kaarten en zeldzaamheden zelf op bij
// TCGdex en laat de database de punten tellen; de app kan geen kaarten, zeldzaamheden of Pokédex-nummers meer opgeven.
// Acties: sync (punten bijwerken), open (pakje), craft (ontbrekende kaart kopen), daily (set van vandaag), health.
// Gebruikt de serversleutel die Supabase zelf aan Edge Functions geeft; geen eigen secrets nodig.
// Deploy: Supabase → Edge Functions → nieuwe functie, naam "crate", dit bestand plakken; "Verify JWT" aan laten.

const ALLOWED_ORIGINS = ['https://dexcrate.com', 'https://www.dexcrate.com', 'https://larsj95.github.io', 'http://localhost:5173', 'http://localhost:4173']
const TCGDEX = 'https://api.tcgdex.net/v2'
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql'
/** Kaartgegevens zo lang bewaren (dagen) voor ze opnieuw opgehaald worden. */
const FACTS_DAYS = 30
/** Per sync maximaal zoveel kaarten en sets opzoeken (de rest de volgende keer). */
const MAX_CARD_LOOKUPS = 40
const MAX_SET_LOOKUPS = 15
const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'] as const

export type PackKind = 'booster' | 'great' | 'master' | 'set' | 'type' | 'lucky' | 'pokemon' | 'era' | 'daily'
export const PACK_KINDS: readonly PackKind[] = ['booster', 'great', 'master', 'set', 'type', 'lucky', 'pokemon', 'era', 'daily']
/** Lucky pack: kans op een God pack (alle kaarten hits). */
export const GOD_PACK_CHANCE = 1 / 30
/** Era pack: tijdperk → TCGdex-series. */
export const ERAS: Record<string, readonly string[]> = {
  wotc: ['base', 'gym', 'neo', 'lc', 'ecard'],
  ex: ['ex'],
  dp: ['dp', 'pl'],
  hgss: ['hgss', 'col'],
  bw: ['bw'],
  xy: ['xy'],
  sm: ['sm'],
  swsh: ['swsh'],
  sv: ['sv'],
  me: ['me'],
}
export interface Pull {
  tcgdex_id: string
  name: string
  image: string | null
  rarity: string
  set_name: string | null
}
interface BriefCard {
  id: string
  localId: string
  name: string
  image: string | null
}

// ---------------------------------------------------------------------------
// Kansen en trekken (zelfde regels als vroeger in de app, src/lib/crate.ts)
// ---------------------------------------------------------------------------
type Odds = readonly { rarity: string; weight: number }[]

export const RARE_SLOT: Odds = [
  { rarity: 'Rare', weight: 0.55 },
  { rarity: 'Rare Holo', weight: 0.17 },
  { rarity: 'Double rare', weight: 0.11 },
  { rarity: 'Ultra Rare', weight: 0.06 },
  { rarity: 'Illustration rare', weight: 0.06 },
  { rarity: 'Special illustration rare', weight: 0.03 },
  { rarity: 'Hyper rare', weight: 0.02 },
]
export const GREAT_SLOT: Odds = [
  { rarity: 'Rare', weight: 0.3 },
  { rarity: 'Rare Holo', weight: 0.22 },
  { rarity: 'Double rare', weight: 0.18 },
  { rarity: 'Ultra Rare', weight: 0.1 },
  { rarity: 'Illustration rare', weight: 0.12 },
  { rarity: 'Special illustration rare', weight: 0.05 },
  { rarity: 'Hyper rare', weight: 0.03 },
]
export const HIT_SLOT: Odds = [
  { rarity: 'Double rare', weight: 0.38 },
  { rarity: 'Ultra Rare', weight: 0.22 },
  { rarity: 'Illustration rare', weight: 0.22 },
  { rarity: 'Special illustration rare', weight: 0.12 },
  { rarity: 'Hyper rare', weight: 0.06 },
]
/** Set pack: kans dat een vak een kaart geeft die je nog mist. */
export const MISSING_FIRST = 0.5
/** Master pack: zoveel keer opnieuw kiezen om een SIR/Hyper die je al hebt te vermijden. */
const NO_DUP_TRIES = 25

export function rarityMatches(rarity: string | null | undefined, wanted: string): boolean {
  if (!rarity) return false
  const norm = (s: string): string => (s.toLowerCase() === 'holo rare' ? 'rare holo' : s.toLowerCase())
  return norm(rarity) === norm(wanted)
}

/** Zelfde rang als de database (crate_rarity_rank); alleen gebruikt voor "SIR of hoger". */
export function isTopRarity(rarity: string): boolean {
  return ['special illustration rare', 'hyper rare', 'mega hyper rare', 'crown', 'secret rare', 'shiny ultra rare'].includes(rarity.toLowerCase())
}

function pick(odds: Odds, random: () => number): string {
  let r = random()
  for (const s of odds) {
    if (r < s.weight) return s.rarity
    r -= s.weight
  }
  return odds[0].rarity
}

const times = (n: number, f: () => string): string[] => Array.from({ length: n }, f)

/** Zeldzaamheden van een pakje (10 vakken); Type, Pokémon en Era pack = Great, Lucky = Booster. Bij Master zijn de laatste twee de hits. */
export function packSlots(pack: PackKind, random: () => number = Math.random): string[] {
  if (pack === 'great' || pack === 'type' || pack === 'pokemon' || pack === 'era') return [...times(5, () => 'Common'), ...times(3, () => 'Uncommon'), ...times(2, () => pick(GREAT_SLOT, random))]
  if (pack === 'master') return [...times(4, () => 'Uncommon'), ...times(4, () => pick(GREAT_SLOT, random)), ...times(2, () => pick(HIT_SLOT, random))]
  return [...times(6, () => 'Common'), ...times(3, () => 'Uncommon'), pick(RARE_SLOT, random)]
}

/** God pack: alle 10 vakken een hit. */
export const godSlots = (random: () => number = Math.random): string[] => times(10, () => pick(HIT_SLOT, random))

/** Gangbare zeldzaamheden van laag naar hoog (voor uitwijken als een Pokémon of tijdperk een zeldzaamheid niet heeft). */
const RANKED = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Hyper rare']

/** Eerst de gevraagde zeldzaamheid, dan steeds een lagere, dan pas hogere. */
export function fallbackOrder(rarity: string): string[] {
  const i = RANKED.findIndex((r) => rarityMatches(r, rarity))
  if (i < 0) return [rarity, ...RANKED.slice().reverse()]
  return [RANKED[i], ...RANKED.slice(0, i).reverse(), ...RANKED.slice(i + 1)]
}

/** Pakje van de dag: de laatste kaart een hit uit de set (of de zeldzaamste die de set heeft). */
export function dailySlots(rarities: readonly string[], random: () => number = Math.random): string[] {
  const slots = setPackSlots(rarities, random)
  const present = [...new Set(rarities)]
  const hits = HIT_SLOT.filter((s) => present.some((r) => rarityMatches(r, s.rarity)))
  const total = hits.reduce((n, s) => n + s.weight, 0)
  const best = [...RANKED].reverse().find((r) => present.some((x) => rarityMatches(x, r)))
  slots[slots.length - 1] = hits.length > 0 ? pick(hits.map((s) => ({ rarity: s.rarity, weight: s.weight / total })), random) : (best ?? slots[slots.length - 1])
  return slots
}

/** Vaste index voor een datum ("2026-10-24"), voor iedereen gelijk. */
export function dayIndex(date: string, n: number): number {
  let h = 2166136261
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return n > 0 ? h % n : 0
}

/** Vakken van een Set pack, beperkt tot de zeldzaamheden die de set heeft. */
export function setPackSlots(rarities: readonly string[], random: () => number = Math.random): string[] {
  const present = [...new Set(rarities)]
  const has = (r: string): boolean => present.some((x) => rarityMatches(x, r))
  const rare = present.filter((r) => !rarityMatches(r, 'Common') && !rarityMatches(r, 'Uncommon'))
  const weights = rare.map((r) => GREAT_SLOT.find((s) => rarityMatches(r, s.rarity))?.weight ?? 0.04)
  const total = weights.reduce((n, w) => n + w, 0)
  const odds: Odds = rare.map((r, i) => ({ rarity: r, weight: weights[i] / total }))
  const rareSlot = (): string => (odds.length > 0 ? pick(odds, random) : (present[0] ?? 'Common'))
  return [
    ...times(5, () => (has('Common') ? 'Common' : has('Uncommon') ? 'Uncommon' : rareSlot())),
    ...times(3, () => (has('Uncommon') ? 'Uncommon' : has('Common') ? 'Common' : rareSlot())),
    ...times(2, rareSlot),
  ]
}

export function pickSetCard<T extends { id: string }>(list: readonly T[], have: ReadonlySet<string>, random: () => number): T | undefined {
  const missing = list.filter((c) => !have.has(`en/${c.id}`))
  const from = missing.length > 0 && random() < MISSING_FIRST ? missing : list
  return from[Math.floor(random() * from.length)]
}

/** Kaart uit een lijst; `avoid` = liefst niet (Master: SIR/Hyper die je al hebt). */
export function pickAvoiding<T extends { id: string }>(list: readonly T[], avoid: ReadonlySet<string>, random: () => number): T | undefined {
  let card = list[Math.floor(random() * list.length)]
  for (let i = 0; i < NO_DUP_TRIES && card && avoid.has(`en/${card.id}`); i++) card = list[Math.floor(random() * list.length)]
  if (card && avoid.has(`en/${card.id}`)) card = list.find((c) => !avoid.has(`en/${c.id}`)) ?? card
  return card
}

// ---------------------------------------------------------------------------
// TCGdex (met geheugen zolang deze functie warm is)
// ---------------------------------------------------------------------------
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const memory = new Map<string, Promise<unknown>>()

function remembered<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memory.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    p.catch(() => memory.delete(key))
    memory.set(key, p)
  }
  return p
}

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return null
    if (res.ok) return res.json()
    if (attempt >= 2) throw new HttpError(502, `TCGdex ${res.status}`)
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
}

const briefCards = (list: unknown): BriefCard[] =>
  Array.isArray(list)
    ? list.flatMap((c) => (isRecord(c) && typeof c.id === 'string' && typeof c.localId === 'string' ? [{ id: c.id, localId: c.localId, name: typeof c.name === 'string' ? c.name : '', image: optStr(c.image) }] : []))
    : []

export const setIdOf = (c: Pick<BriefCard, 'id' | 'localId'>): string => c.id.slice(0, c.id.length - c.localId.length - 1)

const digitalSets = (): Promise<Set<string>> =>
  remembered('digital', async () => {
    const data = await getJson(`${TCGDEX}/en/series/tcgp`).catch(() => null)
    return new Set(isRecord(data) && Array.isArray(data.sets) ? data.sets.flatMap((s) => (isRecord(s) && typeof s.id === 'string' ? [s.id] : [])) : [])
  })

const setNames = (): Promise<Map<string, string>> =>
  remembered('setnames', async () => {
    const data = await getJson(`${TCGDEX}/en/sets`)
    return new Map(Array.isArray(data) ? data.flatMap((s) => (isRecord(s) && typeof s.id === 'string' && typeof s.name === 'string' ? [[s.id, s.name] as const] : [])) : [])
  })

/** Alle Engelse kaarten van een zeldzaamheid (en eventueel type of Pokédex-nummer), met plaatje, zonder TCG Pocket. */
function pool(rarity: string, type?: string, dexId?: number): Promise<BriefCard[]> {
  return remembered(`pool|${rarity}|${type ?? ''}|${dexId ?? ''}`, async () => {
    const r = rarity === 'Rare Holo' ? 'Rare Holo|Holo Rare' : rarity
    const q = `rarity=eq:${encodeURIComponent(r)}${type ? `&types=eq:${encodeURIComponent(type)}` : ''}${dexId ? `&dexId=eq:${dexId}` : ''}`
    const [list, digital] = await Promise.all([getJson(`${TCGDEX}/en/cards?${q}`), digitalSets()])
    return briefCards(list).filter((c) => c.image && !digital.has(setIdOf(c)))
  })
}

/** Sets van een tijdperk (Era pack), via de series van TCGdex. */
function eraSets(era: string): Promise<Set<string>> {
  return remembered(`era|${era}`, async () => {
    const ids = new Set<string>()
    for (const serie of ERAS[era] ?? []) {
      const data = await getJson(`${TCGDEX}/en/series/${serie}`)
      if (isRecord(data) && Array.isArray(data.sets)) for (const s of data.sets) if (isRecord(s) && typeof s.id === 'string') ids.add(s.id)
    }
    return ids
  })
}

/** Set van de dag (UTC-datum): voor iedereen dezelfde, uit de gewone Engelse sets met minstens 60 kaarten. */
export function dailySet(date: string): Promise<{ id: string; name: string }> {
  return remembered(`daily|${date}`, async () => {
    const [list, digital] = await Promise.all([getJson(`${TCGDEX}/en/sets`), digitalSets()])
    const sets = (Array.isArray(list) ? list : [])
      .flatMap((s) => (isRecord(s) && typeof s.id === 'string' && typeof s.name === 'string' && isRecord(s.cardCount) && typeof s.cardCount.official === 'number' ? [{ id: s.id, name: s.name, official: s.cardCount.official }] : []))
      .filter((s) => s.official >= 60 && !digital.has(s.id) && !/promo|jumbo/i.test(s.name))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    if (sets.length === 0) throw new HttpError(502, 'No set for today could be found.')
    const s = sets[dayIndex(date, sets.length)]
    return { id: s.id, name: s.name }
  })
}

/** Datum van vandaag (UTC), "2026-10-24". */
const today = (): string => new Date().toISOString().slice(0, 10)

/** Kaarten van een set met hun zeldzaamheid (GraphQL, 100 per pagina). */
function setCards(setId: string): Promise<{ name: string; cards: (BriefCard & { rarity: string })[] }> {
  return remembered(`set|${setId}`, async () => {
    const set = await getJson(`${TCGDEX}/en/sets/${encodeURIComponent(setId)}`)
    if (!isRecord(set)) throw new HttpError(400, 'This set could not be found.')
    const prefix = `${setId}-`
    const rarity = new Map<string, string>()
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query ($id: ID, $page: Int!) { cards(filters: { id: $id }, pagination: { page: $page, count: 100 }) { id rarity } }', variables: { id: prefix, page } }),
      })
      if (!res.ok) throw new HttpError(502, `TCGdex GraphQL ${res.status}`)
      const json: unknown = await res.json()
      const list = isRecord(json) && isRecord(json.data) && Array.isArray(json.data.cards) ? json.data.cards : []
      for (const c of list) if (isRecord(c) && typeof c.id === 'string' && c.id.startsWith(prefix) && optStr(c.rarity)) rarity.set(c.id, c.rarity as string)
      if (list.length < 100) break
    }
    const cards = briefCards(set.cards).flatMap((c) => (rarity.has(c.id) ? [{ ...c, rarity: rarity.get(c.id) as string }] : []))
    const withImage = cards.filter((c) => c.image)
    return { name: typeof set.name === 'string' ? set.name : setId, cards: withImage.length >= 10 ? withImage : cards }
  })
}

interface CardFacts {
  tcgdex_id: string
  rarity: string | null
  dex_ids: number[]
  set_key: string | null
  local_id: string | null
  found: boolean
  name: string | null
  image: string | null
  set_name: string | null
}

/** Kaartdetails van TCGdex ("en/sv03.5-025"); onbekend bij TCGdex = found false. */
export async function cardFacts(key: string): Promise<CardFacts> {
  const slash = key.indexOf('/')
  const lang = key.slice(0, slash)
  const id = key.slice(slash + 1)
  const none: CardFacts = { tcgdex_id: key, rarity: null, dex_ids: [], set_key: null, local_id: null, found: false, name: null, image: null, set_name: null }
  if (slash < 2 || !/^[a-z-]{2,5}$/.test(lang) || !id) return none
  const c = await getJson(`${TCGDEX}/${lang}/cards/${encodeURIComponent(id)}`)
  if (!isRecord(c)) return none
  const set = isRecord(c.set) ? c.set : {}
  const rarity = optStr(c.rarity)
  return {
    tcgdex_id: key,
    rarity: rarity && rarity.toLowerCase() !== 'none' ? rarity : null,
    dex_ids: Array.isArray(c.dexId) ? c.dexId.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 1025) : [],
    set_key: typeof set.id === 'string' ? `${lang}/${set.id}` : null,
    local_id: optStr(c.localId),
    found: true,
    name: optStr(c.name),
    image: optStr(c.image),
    set_name: optStr(set.name),
  }
}

async function setFacts(setKey: string): Promise<{ set_key: string; name: string | null; official: number }> {
  const slash = setKey.indexOf('/')
  const s = await getJson(`${TCGDEX}/${setKey.slice(0, slash)}/sets/${encodeURIComponent(setKey.slice(slash + 1))}`)
  const count = isRecord(s) && isRecord(s.cardCount) ? s.cardCount : {}
  return { set_key: setKey, name: isRecord(s) ? optStr(s.name) : null, official: typeof count.official === 'number' ? count.official : 0 }
}

/** Taken met een maximum tegelijk. */
async function inBatches<T, R>(items: readonly T[], size: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(f))))
  return out
}

// ---------------------------------------------------------------------------
// Pakje trekken
// ---------------------------------------------------------------------------
export interface Choice {
  setId?: string
  type?: string
  /** Pokémon pack: Pokédex-nummer. */
  dexId?: number
  /** Era pack: sleutel uit ERAS. */
  era?: string
  /** Lucky pack: dit is een God pack (bepaald door de server, niet door de app). */
  god?: boolean
  /** Pakje van de dag: datum (UTC); standaard vandaag. */
  date?: string
}

/** Een pakje van 10 kaarten trekken. `owned` = al in je Crate ("en/sv03.5-025"). */
export async function drawPack(pack: PackKind, choice: Choice, owned: ReadonlySet<string>, random: () => number = Math.random): Promise<Pull[]> {
  const pulls: Pull[] = []
  if (pack === 'set' || pack === 'daily') {
    const daily = pack === 'daily' ? await dailySet(choice.date ?? today()) : null
    const setId = daily?.id ?? choice.setId
    if (!setId || !/^[A-Za-z0-9.+-]{1,30}$/.test(setId)) throw new HttpError(400, 'Pick a set first.')
    const { name, cards } = await setCards(setId)
    if (cards.length === 0) throw new HttpError(400, 'This set has no cards to draw. Pick another set.')
    const have = new Set(owned)
    const rarities = cards.map((c) => c.rarity)
    for (const rarity of daily ? dailySlots(rarities, random) : setPackSlots(rarities, random)) {
      const card = pickSetCard(cards.filter((c) => rarityMatches(c.rarity, rarity)), have, random)
      if (!card) continue
      have.add(`en/${card.id}`)
      pulls.push({ tcgdex_id: `en/${card.id}`, name: card.name, image: card.image, rarity: card.rarity, set_name: name })
    }
  } else {
    const type = pack === 'type' ? choice.type : undefined
    if (pack === 'type' && !(TYPES as readonly string[]).includes(type ?? '')) throw new HttpError(400, 'Pick a type first.')
    const dexId = pack === 'pokemon' ? choice.dexId : undefined
    if (pack === 'pokemon' && !(typeof dexId === 'number' && Number.isInteger(dexId) && dexId >= 1 && dexId <= 1025)) throw new HttpError(400, 'Pick a Pokémon first.')
    if (pack === 'era' && !(choice.era && Object.hasOwn(ERAS, choice.era))) throw new HttpError(400, 'Pick an era first.')
    const inEra = pack === 'era' && choice.era ? await eraSets(choice.era) : null
    const from = async (rarity: string): Promise<BriefCard[]> => {
      const list = await pool(rarity, type, dexId)
      return inEra ? list.filter((c) => inEra.has(setIdOf(c))) : list
    }
    const names = await setNames().catch(() => new Map<string, string>())
    const god = pack === 'lucky' && choice.god === true
    const slots = god ? godSlots(random) : packSlots(pack, random)
    const taken = new Set<string>()
    for (const [i, slot] of slots.entries()) {
      let rarity = slot
      let list = await from(rarity)
      // Zeldzaamheid bestaat niet voor dit type: dan een gewone rare van dat type.
      if (list.length === 0 && type) {
        rarity = 'Rare'
        list = await from(rarity)
      }
      // Pokémon of tijdperk zonder deze zeldzaamheid: eerst lager uitwijken, dan hoger.
      if (list.length === 0 && (dexId || inEra)) {
        for (const r of fallbackOrder(slot).slice(1)) {
          list = await from(r)
          if (list.length > 0) {
            rarity = r
            break
          }
        }
      }
      if (list.length === 0) continue
      // Master-hits en God pack: liefst geen SIR/Hyper die je al hebt, en nooit twee keer dezelfde kaart in het pakje.
      const hit = (pack === 'master' && i >= slots.length - 2 && isTopRarity(rarity)) || god
      const card = hit ? pickAvoiding(list, new Set([...(god ? [] : owned), ...taken]), random) : list[Math.floor(random() * list.length)]
      if (!card) continue
      taken.add(`en/${card.id}`)
      pulls.push({ tcgdex_id: `en/${card.id}`, name: card.name, image: card.image, rarity, set_name: names.get(setIdOf(card)) ?? null })
    }
    if (pulls.length === 0 && pack === 'pokemon') throw new HttpError(400, 'No cards of this Pokémon could be found. Pick another one.')
  }
  if (pulls.length === 0) throw new HttpError(502, 'No cards could be drawn. Try again.')
  return pulls
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
}

function serviceKey(): { key: string; kind: 'legacy' | 'secret' } | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return { key: legacy, kind: legacy.startsWith('sb_secret_') ? 'secret' : 'legacy' }
  try {
    const keys: unknown = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    const first = isRecord(keys) ? Object.values(keys).find((v): v is string => typeof v === 'string' && v.length > 0) : undefined
    return first ? { key: first, kind: 'secret' } : null
  } catch {
    return null
  }
}

function serviceHeaders(): Record<string, string> {
  const k = serviceKey()
  if (!k) throw new HttpError(500, 'The server key is missing in this Edge Function.')
  return k.kind === 'secret' ? { apikey: k.key, 'Content-Type': 'application/json' } : { apikey: k.key, Authorization: `Bearer ${k.key}`, 'Content-Type': 'application/json' }
}

const base = (): string => {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new HttpError(500, 'SUPABASE_URL is missing.')
  return url
}

async function requireUser(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!auth?.startsWith('Bearer ') || !apikey) throw new HttpError(401, 'Not signed in.')
  const res = await fetch(`${base()}/auth/v1/user`, { headers: { Authorization: auth, apikey } })
  const user: unknown = await res.json().catch(() => null)
  if (!res.ok || !isRecord(user) || typeof user.id !== 'string') throw new HttpError(401, 'Not signed in.')
  return user.id
}

/** Fout van de database als nette melding. */
function dbMessage(body: unknown, status: number): HttpError {
  const msg = isRecord(body) && typeof body.message === 'string' ? body.message : `Database ${status}`
  if (/Not enough Crate points/.test(msg)) return new HttpError(400, 'Not enough Crate points.')
  if (isRecord(body) && body.code === 'PGRST202') return new HttpError(503, 'The Crate is not set up yet: run STAP23 in Supabase.')
  return new HttpError(status >= 500 ? 502 : 400, msg)
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${base()}/rest/v1/rpc/${fn}`, { method: 'POST', headers: serviceHeaders(), body: JSON.stringify(args) })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw dbMessage(body, res.status)
  return body
}

/**
 * Rijen uit een tabel (serversleutel), in stukken van 1000. `order` = unieke kolom (primaire sleutel): zonder vaste
 * volgorde kunnen rijen tussen stukken dubbel komen of ontbreken.
 */
async function select(table: string, query: string, order: string, max = 20000): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; from < max; from += 1000) {
    const res = await fetch(`${base()}/rest/v1/${table}?${query}&order=${order}`, { headers: { ...serviceHeaders(), Range: `${from}-${from + 999}` } })
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) throw dbMessage(body, res.status)
    const rows = Array.isArray(body) ? body.filter(isRecord) : []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

async function ownedCrate(user: string): Promise<Set<string>> {
  const rows = await select('crate_cards', `user_id=eq.${user}&select=tcgdex_id`, 'id')
  return new Set(rows.flatMap((r) => (typeof r.tcgdex_id === 'string' ? [r.tcgdex_id] : [])))
}

const inList = (keys: readonly string[]): string => `in.(${keys.map((k) => `"${k.replaceAll('"', '')}"`).join(',')})`

/** Kaart- en setgegevens aanvullen voor wat de gebruiker heeft, dan de punten laten tellen. */
async function sync(user: string): Promise<unknown> {
  const cards = await select('cards', `user_id=eq.${user}&status=neq.sold&tcgdex_id=not.is.null&select=tcgdex_id`, 'id')
  const keys = [...new Set(cards.flatMap((r) => (typeof r.tcgdex_id === 'string' && r.tcgdex_id.includes('/') ? [r.tcgdex_id] : [])))]
  const known = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < keys.length; i += 100) {
    for (const f of await select('card_facts', `tcgdex_id=${encodeURIComponent(inList(keys.slice(i, i + 100)))}&select=tcgdex_id,set_key,fetched_at`, 'tcgdex_id')) known.set(String(f.tcgdex_id), f)
  }
  const stale = Date.now() - FACTS_DAYS * 86_400_000
  const todo = keys.filter((k) => !known.has(k) || Date.parse(String(known.get(k)?.fetched_at)) < stale).slice(0, MAX_CARD_LOOKUPS)
  const fresh = await inBatches(todo, 6, (k) => cardFacts(k).catch(() => null))
  const facts = fresh.filter((f): f is CardFacts => f !== null)

  // Sets: van je echte kaarten en van je Crate, zonder bekende officiële grootte.
  const crate = await ownedCrate(user)
  const setKeys = new Set<string>()
  for (const f of known.values()) if (typeof f.set_key === 'string') setKeys.add(f.set_key)
  for (const f of facts) if (f.set_key) setKeys.add(f.set_key)
  for (const k of crate) setKeys.add(k.replace(/-[^-]+$/, ''))
  const setList = [...setKeys].filter((k) => /^[a-z-]{2,5}\/[A-Za-z0-9.+-]{1,40}$/.test(k))
  const knownSets = new Set<string>()
  for (let i = 0; i < setList.length; i += 100) {
    for (const s of await select('set_facts', `set_key=${encodeURIComponent(inList(setList.slice(i, i + 100)))}&select=set_key`, 'set_key')) knownSets.add(String(s.set_key))
  }
  const setTodo = setList.filter((k) => !knownSets.has(k)).slice(0, MAX_SET_LOOKUPS)
  const sets = (await inBatches(setTodo, 5, (k) => setFacts(k).catch(() => null))).filter((s): s is { set_key: string; name: string | null; official: number } => s !== null)

  if (facts.length > 0 || sets.length > 0) {
    await rpc('crate_srv_put_facts', {
      p_cards: facts.map(({ tcgdex_id, rarity, dex_ids, set_key, local_id, found }) => ({ tcgdex_id, rarity, dex_ids, set_key, local_id, found })),
      p_sets: sets,
    })
  }
  return rpc('crate_srv_sync', { p_user: user })
}

async function requireDb(): Promise<void> {
  const v = await rpc('crate_srv_version', {})
  if (v !== 23) throw new HttpError(503, 'The Crate is not set up yet: run STAP23 in Supabase.')
}

async function handle(req: Request, body: Record<string, unknown>): Promise<unknown> {
  const user = await requireUser(req)
  const action = body.action

  if (action === 'health') {
    const key = serviceKey()?.kind ?? 'missing'
    const db = key === 'missing' ? false : await rpc('crate_srv_version', {}).then((v) => v === 23).catch(() => false)
    return { ok: true, serverKey: key, db }
  }
  await requireDb()

  if (action === 'sync') return sync(user)

  if (action === 'daily') return dailySet(today())

  if (action === 'open') {
    const pack = PACK_KINDS.find((k) => k === body.pack)
    if (!pack) throw new HttpError(400, 'Unknown pack.')
    const owned = pack === 'set' || pack === 'master' || pack === 'daily' ? await ownedCrate(user) : new Set<string>()
    const god = pack === 'lucky' && Math.random() < GOD_PACK_CHANCE
    const choice: Choice = {
      setId: typeof body.setId === 'string' ? body.setId : undefined,
      type: typeof body.type === 'string' ? body.type : undefined,
      dexId: typeof body.dexId === 'number' ? body.dexId : undefined,
      era: typeof body.era === 'string' ? body.era : undefined,
      god,
    }
    const pulls = await drawPack(pack, choice, owned)
    const wallet = await rpc('crate_srv_open', { p_user: user, p_pack: pack, p_cards: pulls })
    return { ...(isRecord(wallet) ? wallet : {}), pulls, god }
  }

  if (action === 'craft') {
    const key = typeof body.tcgdexId === 'string' ? body.tcgdexId : ''
    if (!/^en\/[A-Za-z0-9.+-]{1,30}-[A-Za-z0-9]{1,12}$/.test(key)) throw new HttpError(400, 'Only English cards can be bought.')
    const f = await cardFacts(key)
    if (!f.found || !f.rarity || !f.name) throw new HttpError(400, 'This card cannot be bought.')
    const card: Pull = { tcgdex_id: key, name: f.name, image: f.image, rarity: f.rarity, set_name: f.set_name }
    const wallet = await rpc('crate_srv_craft', { p_user: user, p_card: card })
    return { ...(isRecord(wallet) ? wallet : {}), card }
  }

  throw new HttpError(400, 'Unknown action.')
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405, origin)
  try {
    const body: unknown = await req.json().catch(() => null)
    if (!isRecord(body)) return json({ error: 'Invalid request.' }, 400, origin)
    return json(await handle(req, body), 200, origin)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, origin)
    console.error('crate', err)
    return json({ error: 'Something went wrong.' }, 500, origin)
  }
})
