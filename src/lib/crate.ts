import { FunctionsHttpError } from '@supabase/supabase-js'
import { rarityMatches, rarityRule, type EnergyType } from './cardTraits'
import { fetchAllPages } from './fetchAll'
import { supabase } from './supabase'
import { getSet, getSetList, getSetRarities, searchCards, setIdOf, setOfKey, type SetCard } from './tcgdex'
import type { WishlistInput } from './wishlist'

/**
 * Crate-game (STAP11): Crate points verdienen met je echte collectie en er virtuele pakjes mee openen.
 * Punten en virtuele kaarten veranderen alleen via databasefuncties; de app leest en vraagt aan.
 * Sinds STAP23 (21-10-2026) trekt de Edge Function "crate" de pakjes en telt de database de punten zelf;
 * zonder die functie (of zonder STAP23) werkt de app nog op de oude manier.
 */

export const PACK_SIZE = 10

/** Seintje: je Crate points zijn veranderd (pakje, inruilen, kopen, verdienen, beheer); het menu werkt dan meteen bij. */
export const CRATE_CHANGED_EVENT = 'dexcrate:crate-changed'

export function notifyCrateChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CRATE_CHANGED_EVENT))
}

/** Na een geslaagde wijziging van je punten: seintje geven en het resultaat doorgeven. */
function changed<T>(result: T): T {
  notifyCrateChanged()
  return result
}

/** Soorten pakjes: booster (STAP11), great en master (STAP12), set en type (STAP18), lucky, pokemon, era en daily (STAP26). */
export type PackKind = 'booster' | 'great' | 'master' | 'set' | 'type' | 'lucky' | 'pokemon' | 'era' | 'daily'

export const PACKS: Record<PackKind, { name: string; contents: string }> = {
  booster: { name: 'Booster pack', contents: '6 common, 3 uncommon and 1 rare or better. One free every day.' },
  great: { name: 'Great pack', contents: '5 common, 3 uncommon and 2 rare slots with better odds.' },
  master: { name: 'Master pack', contents: '4 uncommon, 4 rare slots with better odds and 2 guaranteed hits (Double rare or better).' },
  set: { name: 'Set pack', contents: 'Pick a set: 5 common, 3 uncommon and 2 rare or better, all from that set.' },
  type: { name: 'Type pack', contents: 'Pick a type: like a Great pack, with only cards of that type.' },
  lucky: { name: 'Lucky pack', contents: 'Like a Booster pack, with a 1 in 30 chance of a God pack: all 10 cards are hits.' },
  pokemon: { name: 'Pokémon pack', contents: 'Pick a Pokémon: 10 cards of that Pokémon, 2 with better odds of a rare.' },
  era: { name: 'Era pack', contents: 'Pick an era: like a Great pack, only cards from sets of that era.' },
  daily: { name: 'Pack of the day', contents: 'A different set every day, the same for everyone: 5 common, 3 uncommon, 1 rare and 1 guaranteed hit.' },
}

/** Pakjes die alleen de Crate-functie kan trekken (STAP26); STAP-bestand per soort voor de melding zonder prijs. */
const SERVER_ONLY: readonly PackKind[] = ['lucky', 'pokemon', 'era', 'daily']
export const packStep = (kind: PackKind): string => (SERVER_ONLY.includes(kind) ? 'STAP26' : 'STAP18')

/** Tijdperken voor het Era pack (zelfde sleutels als de Crate-functie). */
export const ERAS = [
  { id: 'wotc', name: 'Wizards era (1999–2003)' },
  { id: 'ex', name: 'EX (2003–2007)' },
  { id: 'dp', name: 'Diamond & Pearl, Platinum' },
  { id: 'hgss', name: 'HeartGold & SoulSilver' },
  { id: 'bw', name: 'Black & White' },
  { id: 'xy', name: 'XY' },
  { id: 'sm', name: 'Sun & Moon' },
  { id: 'swsh', name: 'Sword & Shield' },
  { id: 'sv', name: 'Scarlet & Violet' },
  { id: 'me', name: 'Mega Evolution' },
] as const
export type EraId = (typeof ERAS)[number]['id']
export const ERA_IDS: readonly EraId[] = ERAS.map((e) => e.id)

/** Regels van de Crate (STAP18: crate_rules). Zonder STAP18 de oude regels, zonder Set en Type pack. */
export interface CrateRules {
  daily: number
  /** Inruilwaarde x deze factor; STAP18 verdubbelt hem. */
  tradeFactor: number
  /** Punten voor een complete set in je Crate; null = bestaat nog niet. */
  crateSet: number | null
  packs: Partial<Record<PackKind, number>>
  /** Prijs voor een ontbrekende kaart per klasse (STAP22/23); leeg = kan nog niet. */
  craft: Partial<Record<CraftClass, number>>
}

/** Prijsklassen voor gericht kopen (zelfde als crate_craft_class in de database). */
export type CraftClass = 'common' | 'uncommon' | 'rare' | 'double' | 'illustration' | 'special'
const CRAFT_CLASSES: readonly CraftClass[] = ['common', 'uncommon', 'rare', 'double', 'illustration', 'special']

/** Klasse van een zeldzaamheid; null = niet te koop (onbekend, promo ...). */
export function craftClassOf(rarity: string | null | undefined): CraftClass | null {
  const rank = rarityRule(rarity).rank
  if (rank === 1) return 'common'
  if (rank === 2) return 'uncommon'
  if (rank >= 3 && rank <= 4) return 'rare'
  if (rank >= 5 && rank <= 6) return 'double'
  if (rank === 7) return 'illustration'
  if (rank >= 8) return 'special'
  return null
}

/** Prijs van een ontbrekende kaart, of null als hij niet te koop is. */
export function craftCost(rules: CrateRules, rarity: string | null | undefined): number | null {
  const c = craftClassOf(rarity)
  return c ? (rules.craft[c] ?? null) : null
}

export const OLD_RULES: CrateRules = { daily: 50, tradeFactor: 1, crateSet: null, packs: { booster: 100, great: 300, master: 1000 }, craft: {} }

/** Kosten van een pakje, of null als die soort (nog) niet bestaat. */
export const packCost = (rules: CrateRules, pack: PackKind): number | null => rules.packs[pack] ?? null

/** Pakjes van goedkoop naar duur; gelijke prijs in de vaste volgorde, nog niet beschikbaar (geen prijs) achteraan. */
export function packsByCost(rules: CrateRules): PackKind[] {
  const cost = (k: PackKind): number => packCost(rules, k) ?? Number.POSITIVE_INFINITY
  return (Object.keys(PACKS) as PackKind[]).sort((a, b) => cost(a) - cost(b))
}

/** Pakje van de soort is voor dit aantal punten te openen (booster ook gratis). */
export function canAfford(rules: CrateRules, pack: PackKind, points: number, freePack: boolean): boolean {
  const cost = packCost(rules, pack)
  return cost !== null && ((pack === 'booster' && freePack) || points >= cost)
}

/** Regels uit de database lezen; kapot of ontbrekend antwoord = oude regels. */
export function toRules(v: unknown): CrateRules {
  if (!isRecord(v) || !isRecord(v.packs)) return OLD_RULES
  const raw = v.packs
  const packs: Partial<Record<PackKind, number>> = {}
  for (const kind of Object.keys(PACKS) as PackKind[]) {
    const cost = raw[kind]
    if (typeof cost === 'number' && Number.isInteger(cost) && cost >= 0) packs[kind] = cost
  }
  const pos = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : fallback)
  const craft: Partial<Record<CraftClass, number>> = {}
  if (isRecord(v.craft)) {
    for (const c of CRAFT_CLASSES) {
      const cost = v.craft[c]
      if (typeof cost === 'number' && Number.isInteger(cost) && cost > 0) craft[c] = cost
    }
  }
  return {
    daily: pos(v.daily, OLD_RULES.daily),
    tradeFactor: pos(v.trade_factor, 1),
    crateSet: typeof v.crate_set === 'number' && v.crate_set > 0 ? v.crate_set : null,
    packs,
    craft,
  }
}

let rulesCheck: Promise<CrateRules> | null = null

export function getCrateRules(): Promise<CrateRules> {
  rulesCheck ??= (async () => {
    const { data, error } = await supabase.rpc('crate_rules')
    if (!error) return toRules(data)
    if (missingFunction(error)) return OLD_RULES
    rulesCheck = null
    throw new Error(`Loading the Crate rules failed: ${error.message}`)
  })()
  return rulesCheck
}

export interface CrateWallet {
  points: number
  freePack: boolean
}

export interface CrateCard {
  tcgdexId: string
  name: string
  image: string | null
  rarity: string | null
  setName: string | null
  quantity: number
  firstAt: string
}

export interface PackPull {
  tcgdex_id: string
  name: string
  image: string | null
  rarity: string
  set_name: string | null
}

let schemaCheck: Promise<boolean> | null = null

/** True als STAP11 (Crate-game) in de database staat. */
export function hasCrate(): Promise<boolean> {
  schemaCheck ??= (async () => {
    const { error } = await supabase.from('crate_wallet').select('user_id').limit(1)
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205' || /crate_wallet|schema cache/i.test(error.message)) return false
    schemaCheck = null
    throw new Error(`Checking the database failed: ${error.message}`)
  })()
  return schemaCheck
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Stand voor het menu en Overview: punten en of het gratis pakje van vandaag er nog is, zonder punten bij te werken.
 * null = geen Crate (STAP11 niet gedraaid). De database rekent dagen in UTC (current_date).
 */
export async function getCrateStatus(): Promise<{ points: number; freePack: boolean } | null> {
  if (!(await hasCrate())) return null
  const { data, error } = await supabase.from('crate_wallet').select('points, last_free_pack').maybeSingle()
  if (error) throw new Error(`Loading your Crate points failed: ${error.message}`)
  if (!isRecord(data)) return { points: 0, freePack: true }
  const last = typeof data.last_free_pack === 'string' ? data.last_free_pack : null
  return { points: num(data.points), freePack: last === null || last < new Date().toISOString().slice(0, 10) }
}

function toWallet(v: unknown): CrateWallet & { earned: number } {
  const o = isRecord(v) ? v : {}
  return { points: num(o.points), freePack: o.free_pack === true, earned: num(o.earned) }
}

// --- Server (STAP23): Edge Function "crate" ---

export const CRATE_SERVER_MISSING = 'This needs the crate function and STAP23 in Supabase (see TODO.md).'

let serverCheck: Promise<boolean> | null = null

/** Staat de Edge Function "crate" er en is STAP23 gedraaid? Eén keer per sessie; netwerkfout = later opnieuw. */
export function hasCrateServer(): Promise<boolean> {
  serverCheck ??= (async () => {
    const { data, error } = await supabase.functions.invoke('crate', { body: { action: 'health' } })
    if (!error) return isRecord(data) && data.db === true
    const ctx: unknown = error instanceof FunctionsHttpError ? error.context : null
    if (!(ctx instanceof Response && ctx.status === 404)) {
      serverCheck = null
      console.warn('Crate-functie controleren mislukt', error)
    }
    return false
  })()
  return serverCheck
}

async function crateServer(body: Record<string, unknown>, what: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('crate', { body })
  if (error) {
    const ctx: unknown = error instanceof FunctionsHttpError ? error.context : null
    if (ctx instanceof Response) {
      if (ctx.status === 404) throw new Error(CRATE_SERVER_MISSING)
      const res: unknown = await ctx.json().catch(() => null)
      const msg = isRecord(res) ? res.error : null
      if (typeof msg === 'string') throw new Error(msg)
    }
    throw new Error(`${what}: the crate function is unavailable.`)
  }
  return isRecord(data) ? data : {}
}

/**
 * Punten bijwerken: kaarten, verkopen, aankopen, nieuwe Pokédex-soorten, complete sets en de dagbonus (eenmalig per stuk).
 * Met de server rekent de database alles zelf uit (`bonus` en `dexIds` worden dan genegeerd).
 */
export async function syncCrate(bonus: Record<string, number>, dexIds: readonly number[]): Promise<CrateWallet & { earned: number }> {
  if (await hasCrateServer()) return changed(toWallet(await crateServer({ action: 'sync' }, 'Updating Crate points failed')))
  const { data, error } = await supabase.rpc('crate_sync', { p_bonus: bonus, p_dex: [...new Set(dexIds)].filter((d) => d >= 1 && d <= 1025) })
  if (error) throw new Error(`Updating Crate points failed: ${error.message}`)
  return changed(toWallet(data))
}

/** Set compleet: 250 punten, één keer per set ("en/sv03.5"). */
export async function crateSetComplete(setKey: string): Promise<number> {
  if (await hasCrateServer()) return (await syncCrate({}, [])).earned
  const { data, error } = await supabase.rpc('crate_set_complete', { p_set: setKey })
  if (error) throw new Error(`Crate points for the set failed: ${error.message}`)
  return changed(num(data))
}

/** Functie bestaat (nog) niet in de database: STAP12/STAP18 niet gedraaid. */
function missingFunction(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message)
}

/** Set van het Pakje van de dag (de Crate-functie kiest hem, voor iedereen dezelfde). */
export async function getDailyPack(): Promise<{ id: string; name: string }> {
  const r = await crateServer({ action: 'daily' }, 'Loading the pack of the day failed')
  if (typeof r.id !== 'string' || typeof r.name !== 'string') throw new Error('Loading the pack of the day failed: unexpected response.')
  return { id: r.id, name: r.name }
}

/**
 * Pakje openen: met de server trekt die de kaarten; anders trekt de app ze (oude manier, niet voor de STAP26-pakjes).
 * `god`: Lucky pack werd een God pack (alleen de server bepaalt dat).
 */
export async function openPack(pack: PackKind, choice: PackChoice = {}): Promise<CrateWallet & { cost: number; pulls: PackPull[]; god: boolean }> {
  if (await hasCrateServer()) {
    const r = await crateServer({ action: 'open', pack, setId: choice.setId, type: choice.type, dexId: choice.dexId, era: choice.era }, 'Opening the pack failed')
    const pulls = (Array.isArray(r.pulls) ? r.pulls : []).flatMap((p: unknown): PackPull[] =>
      isRecord(p) && typeof p.tcgdex_id === 'string' && typeof p.name === 'string'
        ? [{ tcgdex_id: p.tcgdex_id, name: p.name, image: typeof p.image === 'string' ? p.image : null, rarity: typeof p.rarity === 'string' ? p.rarity : '', set_name: typeof p.set_name === 'string' ? p.set_name : null }]
        : [],
    )
    if (pulls.length === 0) throw new Error('Opening the pack failed: no cards came back.')
    return changed({ points: num(r.points), freePack: r.free_pack === true, cost: num(r.cost), pulls, god: r.god === true })
  }
  if (SERVER_ONLY.includes(pack)) throw new Error(CRATE_SERVER_MISSING)
  const pulls = await drawPack(pack, choice)
  return { ...(await openCratePack(pulls, pack)), pulls, god: false }
}

/** Ontbrekende kaart gericht kopen (alleen met de server: die zoekt kaart en zeldzaamheid zelf op). `card` = wat je kreeg. */
export async function craftCard(tcgdexId: string): Promise<{ points: number; cost: number; card: PackPull | null }> {
  if (!(await hasCrateServer())) throw new Error(CRATE_SERVER_MISSING)
  const r = await crateServer({ action: 'craft', tcgdexId }, 'Buying the card failed')
  const c = isRecord(r.card) ? r.card : null
  const card: PackPull | null =
    c && typeof c.tcgdex_id === 'string' && typeof c.name === 'string'
      ? { tcgdex_id: c.tcgdex_id, name: c.name, image: typeof c.image === 'string' ? c.image : null, rarity: typeof c.rarity === 'string' ? c.rarity : '', set_name: typeof c.set_name === 'string' ? c.set_name : null }
      : null
  return changed({ points: num(r.points), cost: num(r.cost), card })
}

export async function openCratePack(cards: readonly PackPull[], pack: PackKind = 'booster'): Promise<CrateWallet & { cost: number }> {
  let { data, error } = await supabase.rpc('crate_open_pack', { p_cards: cards, p_pack: pack })
  if (error && missingFunction(error)) {
    if (pack !== 'booster') throw new Error('Great and Master packs are not set up yet: run STAP12 in Supabase.')
    ;({ data, error } = await supabase.rpc('crate_open_pack', { p_cards: cards }))
  }
  if (error) {
    if (error.message.includes('Not enough')) throw new Error('Not enough Crate points.')
    if (error.message.includes('Unknown pack')) throw new Error('Set and Type packs are not set up yet: run STAP18 in Supabase.')
    throw new Error(`Opening the pack failed: ${error.message}`)
  }
  const o = isRecord(data) ? data : {}
  return changed({ points: num(o.points), freePack: o.free_pack === true, cost: num(o.cost) })
}

/** Wens bij een vallende ster (STAP13): één keer per dag +5. `gained` 0 = vandaag al gedaan. null = STAP13 ontbreekt. */
export async function makeWish(): Promise<{ points: number; gained: number } | null> {
  const { data, error } = await supabase.rpc('crate_wish')
  if (error) {
    if (missingFunction(error)) return null
    throw new Error(`Making a wish failed: ${error.message}`)
  }
  const o = isRecord(data) ? data : {}
  return changed({ points: num(o.points), gained: num(o.gained) })
}

/** Inruilwaarde per extra exemplaar zonder factor (gelijk aan de databasefunctie crate_trade_value van STAP12). */
function baseTradeValue(rarity: string | null): number {
  const r = (rarity ?? '').toLowerCase()
  if (['special illustration rare', 'hyper rare', 'mega hyper rare', 'crown'].includes(r)) return 30
  if (['illustration rare', 'secret rare', 'shiny ultra rare'].includes(r)) return 15
  if (['double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare'].includes(r)) return 10
  if (r.includes('rare')) return 5
  if (r === 'uncommon') return 3
  return 2
}

/** Inruilwaarde per extra exemplaar; `factor` uit de regels (STAP18: 2). */
export function tradeValue(rarity: string | null, factor = 1): number {
  return baseTradeValue(rarity) * factor
}

/** Startwaarden voor de wishlist met een Crate-kaart als echte kaart (gekoppeld; setcode = officiële afkorting). */
export async function crateWishInitial(tcgdexId: string, name: string): Promise<Partial<WishlistInput>> {
  const ref = setOfKey(tcgdexId)
  let code: string | null = ref?.setId ?? null
  if (ref) {
    try {
      code = (await getSet(ref.lang, ref.setId))?.summary.abbr ?? ref.setId
    } catch (err) {
      console.warn('Setinfo ophalen mislukt', err)
    }
  }
  const localId = ref ? ref.cardId.slice(ref.setId.length + 1) : ''
  return {
    tcgdex_id: tcgdexId,
    name,
    set_code: code?.slice(0, 20) ?? null,
    card_number: /^\d+$/.test(localId) ? String(Number.parseInt(localId, 10)) : localId || null,
    language: ref?.lang === 'en' ? 'en' : null,
  }
}

/** Complete set in je Crate (STAP18): punten, één keer per set ("en/sv03.5"). 0 = nog niet compleet of al gekregen. */
export async function crateSetDone(setKey: string, total: number): Promise<number> {
  if (await hasCrateServer()) return (await syncCrate({}, [])).earned
  const { data, error } = await supabase.rpc('crate_set_done', { p_set: setKey, p_total: total })
  if (error) throw new Error(`Crate points for the set failed: ${error.message}`)
  return changed(num(data))
}

/** Verschillende nummers 1..official die je van een set in je Crate hebt (zoals crate_set_done telt). */
export function crateSetProgress(cards: readonly Pick<CrateCard, 'tcgdexId'>[], setKey: string, official: number): number {
  const prefix = `${setKey}-`
  const have = new Set<number>()
  for (const c of cards) {
    if (!c.tcgdexId.startsWith(prefix)) continue
    const rest = c.tcgdexId.slice(prefix.length)
    if (!/^\d{1,4}$/.test(rest)) continue
    const n = Number.parseInt(rest, 10)
    if (n >= 1 && n <= official) have.add(n)
  }
  return have.size
}

/** Alle dubbelen in één keer inruilen; van elke kaart blijft er één over. Zonder STAP12: per kaart. */
export async function tradeAllDuplicates(cards: readonly CrateCard[]): Promise<{ points: number; gained: number }> {
  const { data, error } = await supabase.rpc('crate_trade_all')
  if (!error) {
    const o = isRecord(data) ? data : {}
    return changed({ points: num(o.points), gained: num(o.gained) })
  }
  if (!missingFunction(error)) throw new Error(`Trading in failed: ${error.message}`)
  let result = { points: 0, gained: 0 }
  for (const c of cards) {
    if (c.quantity < 2) continue
    const r = await tradeCrateCard(c.tcgdexId, c.quantity - 1)
    result = { points: r.points, gained: result.gained + r.gained }
  }
  return result
}

export async function tradeCrateCard(tcgdexId: string, count: number): Promise<{ points: number; gained: number }> {
  const { data, error } = await supabase.rpc('crate_trade', { p_tcgdex_id: tcgdexId, p_count: count })
  if (error) throw new Error(`Trading in failed: ${error.message}`)
  const o = isRecord(data) ? data : {}
  return changed({ points: num(o.points), gained: num(o.gained) })
}

export async function listCrateCards(): Promise<CrateCard[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from('crate_cards')
      .select('tcgdex_id, name, image, rarity, set_name, quantity, first_at')
      .order('last_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error) throw new Error(`Loading your Crate collection failed: ${error.message}`)
  return data.flatMap((r) =>
    isRecord(r) && typeof r.tcgdex_id === 'string' && typeof r.name === 'string'
      ? [
          {
            tcgdexId: r.tcgdex_id,
            name: r.name,
            image: typeof r.image === 'string' ? r.image : null,
            rarity: typeof r.rarity === 'string' ? r.rarity : null,
            setName: typeof r.set_name === 'string' ? r.set_name : null,
            quantity: Math.max(1, num(r.quantity)),
            firstAt: typeof r.first_at === 'string' ? r.first_at : '',
          },
        ]
      : [],
  )
}

// --- Pakje trekken ---

type Odds = readonly { rarity: string; weight: number }[]

/** Kans per zeldzaamheid in het rare-vak van een booster (samen 1). */
export const RARE_SLOT: Odds = [
  { rarity: 'Rare', weight: 0.55 },
  { rarity: 'Rare Holo', weight: 0.17 },
  { rarity: 'Double rare', weight: 0.11 },
  { rarity: 'Ultra Rare', weight: 0.06 },
  { rarity: 'Illustration rare', weight: 0.06 },
  { rarity: 'Special illustration rare', weight: 0.03 },
  { rarity: 'Hyper rare', weight: 0.02 },
]

/** Rare-vak van Great en Master: vaker holo, ex en illustraties. */
export const GREAT_SLOT: Odds = [
  { rarity: 'Rare', weight: 0.3 },
  { rarity: 'Rare Holo', weight: 0.22 },
  { rarity: 'Double rare', weight: 0.18 },
  { rarity: 'Ultra Rare', weight: 0.1 },
  { rarity: 'Illustration rare', weight: 0.12 },
  { rarity: 'Special illustration rare', weight: 0.05 },
  { rarity: 'Hyper rare', weight: 0.03 },
]

/** Gegarandeerde hit in een Master pack: Double rare of beter. */
export const HIT_SLOT: Odds = [
  { rarity: 'Double rare', weight: 0.38 },
  { rarity: 'Ultra Rare', weight: 0.22 },
  { rarity: 'Illustration rare', weight: 0.22 },
  { rarity: 'Special illustration rare', weight: 0.12 },
  { rarity: 'Hyper rare', weight: 0.06 },
]

function pick(odds: Odds, random: () => number): string {
  let r = random()
  for (const s of odds) {
    if (r < s.weight) return s.rarity
    r -= s.weight
  }
  return odds[0].rarity
}

const times = (n: number, f: () => string): string[] => Array.from({ length: n }, f)

/** Zeldzaamheden van een pakje (10 vakken); Type pack = Great. Set pack: zie setPackSlots. */
export function packSlots(pack: PackKind = 'booster', random: () => number = Math.random): string[] {
  if (pack === 'great' || pack === 'type') return [...times(5, () => 'Common'), ...times(3, () => 'Uncommon'), ...times(2, () => pick(GREAT_SLOT, random))]
  if (pack === 'master') return [...times(4, () => 'Uncommon'), ...times(4, () => pick(GREAT_SLOT, random)), ...times(2, () => pick(HIT_SLOT, random))]
  return [...times(6, () => 'Common'), ...times(3, () => 'Uncommon'), pick(RARE_SLOT, random)]
}

const pools = new Map<string, Promise<SetCard[]>>()

/** Alle Engelse kaarten van een zeldzaamheid met plaatje (één keer per sessie opgehaald). */
function pool(rarity: string): Promise<SetCard[]> {
  let p = pools.get(rarity)
  if (!p) {
    p = searchCards('en', '', { rarity }).then((list) => list.filter((c) => c.image))
    p.catch(() => pools.delete(rarity))
    pools.set(rarity, p)
  }
  return p
}

/** Alle Engelse kaarten van een zeldzaamheid en een type met plaatje (Type pack). */
function typePool(rarity: string, type: EnergyType): Promise<SetCard[]> {
  const k = `${rarity}|${type}`
  let p = pools.get(k)
  if (!p) {
    p = searchCards('en', '', { rarity, type }).then((list) => list.filter((c) => c.image))
    p.catch(() => pools.delete(k))
    pools.set(k, p)
  }
  return p
}

/**
 * Vakken van een Set pack: 5 common, 3 uncommon en 2 rare-vakken met de Great-kansen, beperkt tot de zeldzaamheden
 * die de set echt heeft (andere, bv. ACE SPEC, wegen 0,04). Geen uncommons: common; geen van beide (promo's): het rare-vak.
 */
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

export interface PackChoice {
  /** Set pack: Engelse set-id ("sv03.5"). */
  setId?: string
  /** Set pack: kaarten die al in je Crate zitten ("en/sv03.5-025"), voor "ontbrekend eerst". */
  owned?: ReadonlySet<string>
  /** Type pack: energietype. */
  type?: EnergyType
  /** Pokémon pack: Pokédex-nummer. */
  dexId?: number
  /** Era pack: tijdperk. */
  era?: EraId
}

/**
 * Set pack: kans dat een vak een kaart geeft die je nog mist (als die er in die zeldzaamheid is). Zonder dit kost een
 * grote set als 151 zo'n 128 Set packs (±6 maanden), met 50% zo'n 46 (gesimuleerd 18-10-2026, keuze gebruiker).
 */
export const MISSING_FIRST = 0.5

/** Eén kaart uit een vak: met kans MISSING_FIRST een ontbrekende, anders willekeurig. `have` = al in je Crate of dit pakje. */
export function pickSetCard<T extends { id: string }>(list: readonly T[], have: ReadonlySet<string>, random: () => number): T | undefined {
  const missing = list.filter((c) => !have.has(`en/${c.id}`))
  const from = missing.length > 0 && random() < MISSING_FIRST ? missing : list
  return from[Math.floor(random() * from.length)]
}

/** Kaarten van een set met hun zeldzaamheid (Set pack); liefst alleen kaarten met plaatje. */
async function setCards(setId: string): Promise<{ name: string; cards: (SetCard & { rarity: string })[] }> {
  const [set, rarities] = await Promise.all([getSet('en', setId), getSetRarities('en', setId)])
  if (!set) throw new Error('This set could not be loaded. Try again or pick another set.')
  const cards = set.cards.flatMap((c) => {
    const rarity = rarities?.get(c.id)
    return rarity ? [{ ...c, rarity }] : []
  })
  const withImage = cards.filter((c) => c.image)
  return { name: set.summary.name, cards: withImage.length >= 10 ? withImage : cards }
}

/** Een virtueel pakje van 10 kaarten trekken (nog niet opgeslagen). */
export async function drawPack(pack: PackKind = 'booster', choice: PackChoice = {}, random: () => number = Math.random): Promise<PackPull[]> {
  const sets = await getSetList('en').catch(() => new Map<string, { name: string }>())
  const pulls: PackPull[] = []
  if (pack === 'set') {
    if (!choice.setId) throw new Error('Pick a set first.')
    const { name, cards } = await setCards(choice.setId)
    if (cards.length === 0) throw new Error('This set has no cards to draw. Pick another set.')
    const have = new Set(choice.owned ?? [])
    for (const rarity of setPackSlots(cards.map((c) => c.rarity), random)) {
      const card = pickSetCard(cards.filter((c) => rarityMatches(c.rarity, rarity)), have, random)
      if (!card) continue
      have.add(`en/${card.id}`)
      pulls.push({ tcgdex_id: `en/${card.id}`, name: card.name, image: card.image, rarity: card.rarity, set_name: name })
    }
  } else {
    const type = pack === 'type' ? choice.type : undefined
    if (pack === 'type' && !type) throw new Error('Pick a type first.')
    for (const rarity of packSlots(pack, random)) {
      let list = type ? await typePool(rarity, type) : await pool(rarity)
      // Zeldzaamheid bestaat niet voor dit type: dan een gewone rare van dat type.
      if (list.length === 0 && type) list = await typePool('Rare', type)
      if (list.length === 0) continue
      const card = list[Math.floor(random() * list.length)]
      pulls.push({ tcgdex_id: `en/${card.id}`, name: card.name, image: card.image, rarity, set_name: sets.get(setIdOf(card))?.name ?? null })
    }
  }
  if (pulls.length === 0) throw new Error('No cards could be drawn. Check your connection and try again.')
  return pulls
}

// --- Overzicht ---

export interface CrateSummary {
  unique: number
  copies: number
  /** Totale Cardmarket-waarde (alle exemplaren) van de kaarten met een prijs. */
  value: number
  /** Waarde van alle extra exemplaren. */
  duplicateValue: number
  /** Punten als je alle dubbelen inruilt. */
  duplicatePoints: number
  /** Aantal kaarten met een bekende prijs. */
  priced: number
  top: { card: CrateCard; value: number } | null
  byRarity: { rarity: string; unique: number; copies: number; value: number }[]
}

/** Totalen van je Crate; `valueOf` geeft de prijs van één exemplaar (null/undefined = onbekend); `tradeFactor` uit de regels. */
export function summarizeCrate(cards: readonly CrateCard[], valueOf: (tcgdexId: string) => number | null | undefined, tradeFactor = 1): CrateSummary {
  const out: CrateSummary = { unique: cards.length, copies: 0, value: 0, duplicateValue: 0, duplicatePoints: 0, priced: 0, top: null, byRarity: [] }
  const groups = new Map<string, { rarity: string; unique: number; copies: number; value: number }>()
  for (const c of cards) {
    const v = valueOf(c.tcgdexId)
    const each = typeof v === 'number' ? v : 0
    out.copies += c.quantity
    out.duplicatePoints += (c.quantity - 1) * tradeValue(c.rarity, tradeFactor)
    if (typeof v === 'number') {
      out.priced += 1
      out.value += each * c.quantity
      out.duplicateValue += each * (c.quantity - 1)
      if (!out.top || v > out.top.value) out.top = { card: c, value: v }
    }
    const rarity = c.rarity ?? 'Unknown'
    const g = groups.get(rarity) ?? { rarity, unique: 0, copies: 0, value: 0 }
    g.unique += 1
    g.copies += c.quantity
    g.value += each * c.quantity
    groups.set(rarity, g)
  }
  out.byRarity = [...groups.values()].sort((a, b) => rarityRule(b.rarity).rank - rarityRule(a.rarity).rank || b.copies - a.copies)
  return out
}
