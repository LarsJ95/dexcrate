import { supabase } from './supabase'
import { getSetList, searchCards, setIdOf, type SetCard } from './tcgdex'

/**
 * Crate-game (STAP11): Crate points verdienen met je echte collectie en er virtuele pakjes mee openen.
 * Punten en virtuele kaarten veranderen alleen via databasefuncties; de app leest en vraagt aan.
 */

export const PACK_COST = 100
export const PACK_SIZE = 10

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

export async function openCratePack(cards: readonly PackPull[]): Promise<CrateWallet & { cost: number }> {
  const { data, error } = await supabase.rpc('crate_open_pack', { p_cards: cards })
  if (error) throw new Error(error.message.includes('Not enough') ? 'Not enough Crate points.' : `Opening the pack failed: ${error.message}`)
  const o = isRecord(data) ? data : {}
  return { points: num(o.points), freePack: false, cost: num(o.cost) }
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

/** Kans per zeldzaamheid in het rare-vak (samen 1). */
export const RARE_SLOT: readonly { rarity: string; weight: number }[] = [
  { rarity: 'Rare', weight: 0.55 },
  { rarity: 'Rare Holo', weight: 0.17 },
  { rarity: 'Double rare', weight: 0.11 },
  { rarity: 'Ultra Rare', weight: 0.06 },
  { rarity: 'Illustration rare', weight: 0.06 },
  { rarity: 'Special illustration rare', weight: 0.03 },
  { rarity: 'Hyper rare', weight: 0.02 },
]

/** Zeldzaamheden van een pakje: 6 common, 3 uncommon, 1 rare-vak (gewogen). */
export function packSlots(random: () => number = Math.random): string[] {
  let r = random()
  let rare = RARE_SLOT[0].rarity
  for (const s of RARE_SLOT) {
    if (r < s.weight) {
      rare = s.rarity
      break
    }
    r -= s.weight
  }
  return [...Array<string>(6).fill('Common'), ...Array<string>(3).fill('Uncommon'), rare]
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
export async function drawPack(random: () => number = Math.random): Promise<PackPull[]> {
  const slots = packSlots(random)
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
