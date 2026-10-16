import { readCache, writeCache } from './tcgdex'

/**
 * Evolutielijnen via PokéAPI (Pokédex-soort → evolutieketen). Een lijn is één pad van de basis-Pokémon
 * tot een eindvorm (Eevee → Vaporeon is een andere lijn dan Eevee → Jolteon). Lokaal 90 dagen bewaard.
 */

const API = 'https://pokeapi.co/api/v2'
const PREFIX = 'pokeapi:evo:v1:'
const TTL_MS = 90 * 24 * 60 * 60 * 1000

const idFromUrl = (url: unknown): number | null => {
  const m = typeof url === 'string' ? url.match(/\/(\d+)\/?$/) : null
  return m ? Number(m[1]) : null
}

interface ChainLink {
  species?: { url?: unknown }
  evolves_to?: unknown
}

/** Evolutieketen (PokéAPI) → paden van basis tot eindvorm, als Pokédex-nummers. */
export function parseChain(data: unknown): number[][] {
  const root = typeof data === 'object' && data !== null ? (data as { chain?: unknown }).chain : null
  const out: number[][] = []
  const walk = (link: unknown, path: number[]): void => {
    if (typeof link !== 'object' || link === null) return
    const l = link as ChainLink
    const id = idFromUrl(l.species?.url)
    if (id === null) return
    const next = [...path, id]
    const children = Array.isArray(l.evolves_to) ? l.evolves_to : []
    if (children.length === 0) out.push(next)
    for (const c of children) walk(c, next)
  }
  walk(root, [])
  return out
}

const inflight = new Map<number, Promise<number[][]>>()

/** Paden van de keten waar deze Pokémon in zit; [] als er geen evolutie is of het ophalen mislukt. */
export function getEvolutionPaths(dexId: number): Promise<number[][]> {
  const cached = readCache<number[][]>(PREFIX, TTL_MS, String(dexId))
  if (cached) return Promise.resolve(cached)
  let p = inflight.get(dexId)
  if (!p) {
    p = (async () => {
      const species = await fetch(`${API}/pokemon-species/${dexId}`)
      if (!species.ok) throw new Error(`PokéAPI ${species.status}`)
      const chainId = idFromUrl(((await species.json()) as { evolution_chain?: { url?: unknown } }).evolution_chain?.url)
      if (chainId === null) return []
      const chain = await fetch(`${API}/evolution-chain/${chainId}`)
      if (!chain.ok) throw new Error(`PokéAPI ${chain.status}`)
      const paths = parseChain(await chain.json())
      // Elke soort in de keten krijgt dezelfde paden; scheelt verzoeken voor de rest van de lijn.
      for (const id of new Set(paths.flat())) writeCache(PREFIX, String(id), paths)
      return paths
    })().catch((err: unknown) => {
      console.warn(`Evolutielijn ophalen mislukt voor #${dexId}`, err)
      inflight.delete(dexId)
      return []
    })
    inflight.set(dexId, p)
  }
  return p
}

export interface EvolutionLine {
  /** Pokédex-nummers van basis tot eindvorm. */
  path: number[]
  owned: number
  complete: boolean
}

/**
 * Lijnen waar je minstens één Pokémon van hebt (alleen echte evoluties, 2+ stadia). Complete lijnen eerst,
 * dan de lijnen die het dichtst bij compleet zijn.
 */
export function evolutionLines(owned: ReadonlySet<number>, pathsByDex: ReadonlyMap<number, number[][]>): EvolutionLine[] {
  const seen = new Set<string>()
  const lines: EvolutionLine[] = []
  for (const dex of owned) {
    for (const path of pathsByDex.get(dex) ?? []) {
      const key = path.join('>')
      if (path.length < 2 || seen.has(key)) continue
      seen.add(key)
      const have = path.filter((d) => owned.has(d)).length
      lines.push({ path, owned: have, complete: have === path.length })
    }
  }
  return lines.sort((a, b) => Number(b.complete) - Number(a.complete) || b.owned / b.path.length - a.owned / a.path.length || a.path[0] - b.path[0])
}
