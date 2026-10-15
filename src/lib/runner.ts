import { isEnergyType, type EnergyType } from './cardTraits'

/**
 * Langsrenner (DESIGN.md §9): Pokémon uit de eigen collectie. De lijst groeit mee als je kaarten
 * bekijkt en wordt per apparaat bewaard, zodat er geen extra verzoeken nodig zijn.
 */
export interface RunnerEntry {
  dexId: number
  name: string
  type: EnergyType | null
}

const POOL_KEY = 'dexcrate:runner-pool'
const MAX_POOL = 300
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

/** Ghost-Pokémon (Pokédex-nummers); TCG kent geen Ghost-type, dus 's nachts op nummer. */
const GHOSTS = new Set([
  92, 93, 94, 200, 292, 302, 353, 354, 355, 356, 425, 426, 429, 442, 477, 478, 479, 487, 562, 563, 592, 593, 607, 608, 609, 622,
  623, 708, 709, 710, 711, 724, 769, 770, 778, 781, 792, 802, 806, 854, 855, 864, 867, 885, 886, 887, 911, 937, 971, 972, 979, 987,
  999, 1000,
])

let pool: Map<number, RunnerEntry> | null = null
let saveTimer: number | null = null

function load(): Map<number, RunnerEntry> {
  if (pool) return pool
  pool = new Map()
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(POOL_KEY) ?? '[]')
    if (Array.isArray(parsed)) {
      for (const e of parsed as unknown[]) {
        if (typeof e !== 'object' || e === null) continue
        const { dexId, name, type } = e as Record<string, unknown>
        if (typeof dexId === 'number' && Number.isInteger(dexId) && dexId > 0 && typeof name === 'string') {
          pool.set(dexId, { dexId, name: name.slice(0, 40), type: isEnergyType(type) ? type : null })
        }
      }
    }
  } catch {
    // Geen opslag of kapotte lijst: begin leeg.
  }
  return pool
}

/** Naam van de soort uit een kaartnaam: "Mew ex" → "Mew", "Charizard VMAX" → "Charizard". */
export function speciesName(cardName: string): string {
  return cardName.replace(/\s+(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|Prime|δ|☆|◇)$/u, '').trim()
}

export function registerRunner(entry: RunnerEntry): void {
  const p = load()
  if (p.has(entry.dexId)) return
  if (p.size >= MAX_POOL) p.delete(p.keys().next().value as number)
  p.set(entry.dexId, entry)
  if (saveTimer !== null) return
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(POOL_KEY, JSON.stringify([...p.values()]))
    } catch (err) {
      console.warn('Langsrenners bewaren mislukt', err)
    }
  }, 2000)
}

export function isNight(date = new Date()): boolean {
  const h = date.getHours()
  return h >= 20 || h < 6
}

/** Willekeurige renner; 's avonds tellen Ghost- en Darkness-Pokémon vier keer zo zwaar. */
export function pickRunner(night = isNight(), random = Math.random): RunnerEntry | null {
  const list = [...load().values()]
  if (list.length === 0) return null
  const weight = (e: RunnerEntry): number => (night && (GHOSTS.has(e.dexId) || e.type === 'Darkness') ? 4 : 1)
  let r = random() * list.reduce((sum, e) => sum + weight(e), 0)
  for (const e of list) {
    r -= weight(e)
    if (r < 0) return e
  }
  return list[list.length - 1]
}

/** Sprite-adressen in volgorde van voorkeur: bewegend (Black/White), anders stilstaand. */
export function spriteUrls(dexId: number, shiny: boolean): string[] {
  const s = shiny ? '/shiny' : ''
  return [`${SPRITES}/versions/generation-v/black-white/animated${s}/${dexId}.gif`, `${SPRITES}${s}/${dexId}.png`]
}

export const SHINY_CHANCE = 1 / 50

let previewDelay: number | null = null

/** Alleen voor de ontwerppreview: vaste renners en een korte eerste wachttijd. */
export function seedRunnerForPreview(entries: RunnerEntry[], firstDelay: number): void {
  pool = new Map(entries.map((e) => [e.dexId, e]))
  previewDelay = firstDelay
}

export function previewRunnerDelay(): number | null {
  return previewDelay
}
