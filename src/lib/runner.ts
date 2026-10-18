import { isEnergyType, type EnergyType } from './cardTraits'

/**
 * Pokémon uit de eigen collectie (voor de vliegende Pokémon in de achtergrond, DESIGN.md §9). De lijst groeit mee
 * als je kaarten bekijkt en wordt per apparaat bewaard, zodat er geen extra verzoeken nodig zijn.
 */
export interface RunnerEntry {
  dexId: number
  name: string
  type: EnergyType | null
}

const POOL_KEY = 'dexcrate:runner-pool'
const MAX_POOL = 300
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

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

/** Pokédex-nummers uit je collectie die de app al kent (zonder extra verzoeken). */
export function ownedDexIds(): number[] {
  return [...load().keys()]
}

/** Sprite-adressen in volgorde van voorkeur: bewegend (Black/White), anders stilstaand. */
export function spriteUrls(dexId: number, shiny: boolean): string[] {
  const s = shiny ? '/shiny' : ''
  return [`${SPRITES}/versions/generation-v/black-white/animated${s}/${dexId}.gif`, `${SPRITES}${s}/${dexId}.png`]
}

export const SHINY_CHANCE = 1 / 50
