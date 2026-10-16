import { rarityRule } from './cardTraits'
import { supabase } from './supabase'
import { getSetList, searchCards, setIdOf, type SetCard } from './tcgdex'

/**
 * Crate-game (STAP11): Crate points verdienen met je echte collectie en er virtuele pakjes mee openen.
 * Punten en virtuele kaarten veranderen alleen via databasefuncties; de app leest en vraagt aan.
 */

export const PACK_SIZE = 10

/** Soorten pakjes (STAP12); zonder STAP12 bestaat alleen de booster. */
export type PackKind = 'booster' | 'great' | 'master'

export const PACKS: Record<PackKind, { name: string; cost: number; contents: string }> = {
  booster: { name: 'Booster pack', cost: 100, contents: '6 common, 3 uncommon and 1 rare or better. One free every day.' },
  great: { name: 'Great pack', cost: 300, contents: '5 common, 3 uncommon and 2 rare slots with better odds.' },
  master: { name: 'Master pack', cost: 1000, contents: '4 uncommon, 4 rare slots with better odds and 2 guaranteed hits (Double rare or better).' },
}

/** Pakje van de soort is voor dit aantal punten te openen (booster ook gratis). */
export function canAfford(pack: PackKind, points: number, freePack: boolean): boolean {
  return (pack === 'booster' && freePack) || points >= PACKS[pack].cost
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function toWallet(v: unknown): CrateWallet & { earned: number } {
  const o = isRecord(v) ? v : {}
  return { points: num(o.points), freePack: o.free_pack === true, earned: num(o.earned) }
}

/** Punten bijwerken: kaarten, verkopen, aankopen, nieuwe Pokédex-soorten en de dagbonus (eenmalig per stuk). */
export async function syncCrate(bonus: Record<string, number>, dexIds: readonly number[]): Promise<CrateWallet & { earned: number }> {
  const { data, error } = await supabase.rpc('crate_sync', { p_bonus: bonus, p_dex: [...new Set(dexIds)].filter((d) => d >= 1 && d <= 1025) })
  if (error) throw new Error(`Updating Crate points failed: ${error.message}`)
  return toWallet(data)
}

/** Set compleet: 250 punten, één keer per set ("en/sv03.5"). */
export async function crateSetComplete(setKey: string): Promise<number> {
  const { data, error } = await supabase.rpc('crate_set_complete', { p_set: setKey })
  if (error) throw new Error(`Crate points for the set failed: ${error.message}`)
  return num(data)
}

/** Functie bestaat (nog) niet in de database: STAP12 niet gedraaid. */
const missingFunction = (error: { code?: string; message: string }): boolean => error.code === 'PGRST202' || /could not find the function/i.test(error.message)

export async function openCratePack(cards: readonly PackPull[], pack: PackKind = 'booster'): Promise<CrateWallet & { cost: number }> {
  let { data, error } = await supabase.rpc('crate_open_pack', { p_cards: cards, p_pack: pack })
  if (error && missingFunction(error)) {
    if (pack !== 'booster') throw new Error('Great and Master packs are not set up yet: run STAP12 in Supabase.')
    ;({ data, error } = await supabase.rpc('crate_open_pack', { p_cards: cards }))
  }
  if (error) throw new Error(error.message.includes('Not enough') ? 'Not enough Crate points.' : `Opening the pack failed: ${error.message}`)
  const o = isRecord(data) ? data : {}
  return { points: num(o.points), freePack: o.free_pack === true, cost: num(o.cost) }
}

/** Wens bij een vallende ster (STAP13): één keer per dag +5. `gained` 0 = vandaag al gedaan. null = STAP13 ontbreekt. */
export async function makeWish(): Promise<{ points: number; gained: number } | null> {
  const { data, error } = await supabase.rpc('crate_wish')
  if (error) {
    if (missingFunction(error)) return null
    throw new Error(`Making a wish failed: ${error.message}`)
  }
  const o = isRecord(data) ? data : {}
  return { points: num(o.points), gained: num(o.gained) }
}

/** Inruilwaarde per extra exemplaar (gelijk aan de databasefunctie crate_trade_value). */
export function tradeValue(rarity: string | null): number {
  const r = (rarity ?? '').toLowerCase()
  if (['special illustration rare', 'hyper rare', 'mega hyper rare', 'crown'].includes(r)) return 30
  if (['illustration rare', 'secret rare', 'shiny ultra rare'].includes(r)) return 15
  if (['double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare'].includes(r)) return 10
  if (r.includes('rare')) return 5
  if (r === 'uncommon') return 3
  return 2
}

/** Alle dubbelen in één keer inruilen; van elke kaart blijft er één over. Zonder STAP12: per kaart. */
export async function tradeAllDuplicates(cards: readonly CrateCard[]): Promise<{ points: number; gained: number }> {
  const { data, error } = await supabase.rpc('crate_trade_all')
  if (!error) {
    const o = isRecord(data) ? data : {}
    return { points: num(o.points), gained: num(o.gained) }
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
  return { points: num(o.points), gained: num(o.gained) }
}

export async function listCrateCards(): Promise<CrateCard[]> {
  const { data, error } = await supabase.from('crate_cards').select('tcgdex_id, name, image, rarity, set_name, quantity, first_at').order('last_at', { ascending: false })
  if (error) throw new Error(`Loading your Crate collection failed: ${error.message}`)
  return (data as unknown[]).flatMap((r) =>
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

/** Zeldzaamheden van een pakje (10 vakken). */
export function packSlots(pack: PackKind = 'booster', random: () => number = Math.random): string[] {
  if (pack === 'great') return [...times(5, () => 'Common'), ...times(3, () => 'Uncommon'), ...times(2, () => pick(GREAT_SLOT, random))]
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

/** Een virtueel pakje van 10 kaarten trekken (nog niet opgeslagen). */
export async function drawPack(pack: PackKind = 'booster', random: () => number = Math.random): Promise<PackPull[]> {
  const slots = packSlots(pack, random)
  const sets = await getSetList('en').catch(() => new Map())
  const pulls: PackPull[] = []
  for (const rarity of slots) {
    const list = await pool(rarity)
    if (list.length === 0) continue
    const card = list[Math.floor(random() * list.length)]
    pulls.push({ tcgdex_id: `en/${card.id}`, name: card.name, image: card.image, rarity, set_name: sets.get(setIdOf(card))?.name ?? null })
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

/** Totalen van je Crate; `valueOf` geeft de prijs van één exemplaar (null/undefined = onbekend). */
export function summarizeCrate(cards: readonly CrateCard[], valueOf: (tcgdexId: string) => number | null | undefined): CrateSummary {
  const out: CrateSummary = { unique: cards.length, copies: 0, value: 0, duplicateValue: 0, duplicatePoints: 0, priced: 0, top: null, byRarity: [] }
  const groups = new Map<string, { rarity: string; unique: number; copies: number; value: number }>()
  for (const c of cards) {
    const v = valueOf(c.tcgdexId)
    const each = typeof v === 'number' ? v : 0
    out.copies += c.quantity
    out.duplicatePoints += (c.quantity - 1) * tradeValue(c.rarity)
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
