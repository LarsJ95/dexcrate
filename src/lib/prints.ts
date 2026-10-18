import { digitalSetIds, getCardInfo, readCache, splitKey, writeCache } from './tcgdex'

/**
 * Andere prints van dezelfde kaart (idee uit DEX, 18-10-2026): herdrukken in andere sets, zoals Base Set Voltorb in
 * Base Set 2 en Legendary Collection. Alleen Engels: de GraphQL-API van TCGdex kent geen andere talen.
 */

const GRAPHQL = 'https://api.tcgdex.net/v2/graphql'
const PREFIX = 'tcgdex:prints:v1:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const PAGE = 100

/** Wat een print bepaalt: naam, illustrator, HP en aanvallen. */
export interface PrintTraits {
  name: string
  illustrator: string | null
  hp: number | null
  attacks: readonly string[]
}

export interface OtherPrint {
  key: string
  name: string
  localId: string
  setId: string
  setName: string
  image: string | null
}

const norm = (s: string): string => s.trim().toLowerCase()

/**
 * Zelfde kaart? Zelfde naam, illustrator, HP en aanvallen (in dezelfde volgorde). Zonder illustrator geen uitspraak:
 * dan zou elke kaart met dezelfde naam en aanval meetellen.
 */
export function samePrint(a: PrintTraits, b: PrintTraits): boolean {
  if (!a.illustrator || !b.illustrator) return false
  return (
    norm(a.name) === norm(b.name) &&
    norm(a.illustrator) === norm(b.illustrator) &&
    a.hp === b.hp &&
    a.attacks.length === b.attacks.length &&
    a.attacks.every((x, i) => norm(x) === norm(b.attacks[i]))
  )
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

interface Row extends PrintTraits {
  id: string
  localId: string
  image: string | null
  setId: string
  setName: string
}

/** Antwoord van TCGdex → rijen; onbruikbare kaarten vallen weg. */
export function parsePrintRows(list: unknown): Row[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((c): Row[] => {
    if (!isRecord(c) || typeof c.id !== 'string' || typeof c.name !== 'string' || !isRecord(c.set) || typeof c.set.id !== 'string') return []
    const attacks = Array.isArray(c.attacks) ? c.attacks.flatMap((a) => (isRecord(a) && typeof a.name === 'string' ? [a.name] : [])) : []
    return [
      {
        id: c.id,
        localId: str(c.localId) ?? '',
        name: c.name,
        image: str(c.image),
        illustrator: str(c.illustrator),
        hp: typeof c.hp === 'number' ? c.hp : null,
        attacks,
        setId: c.set.id,
        setName: str(c.set.name) ?? c.set.id,
      },
    ]
  })
}

async function cardsNamed(name: string): Promise<Row[]> {
  const out: Row[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query ($name: String, $page: Int!) { cards(filters: { name: $name }, pagination: { page: $page, count: 100 }) { id localId name image illustrator hp attacks { name } set { id name } } }',
        variables: { name: `eq:${name}`, page },
      }),
    })
    if (!res.ok) throw new Error(`TCGdex GraphQL ${res.status}`)
    const json: unknown = await res.json()
    const list = isRecord(json) && isRecord(json.data) ? json.data.cards : null
    if (!Array.isArray(list)) throw new Error('TCGdex GraphQL: unexpected answer')
    out.push(...parsePrintRows(list))
    if (list.length < PAGE) break
  }
  return out
}

/** Andere prints van een kaart ("en/base1-67"), zonder TCG Pocket; 7 dagen bewaard. Andere talen: leeg. */
export async function getOtherPrints(key: string): Promise<OtherPrint[]> {
  const parts = splitKey(key)
  if (!parts || parts.lang !== 'en') return []
  const cached = readCache<OtherPrint[]>(PREFIX, TTL_MS, key)
  if (cached) return cached
  const info = await getCardInfo(key)
  if (!info?.illustrator) return []
  const me: PrintTraits = { name: info.name, illustrator: info.illustrator, hp: info.game?.hp ?? null, attacks: info.game?.attacks.map((a) => a.name) ?? [] }
  const [rows, digital] = await Promise.all([cardsNamed(info.name), digitalSetIds('en')])
  const prints = rows
    .filter((r) => r.id !== parts.cardId && !digital.has(r.setId) && samePrint(me, r))
    .map((r) => ({ key: `en/${r.id}`, name: r.name, localId: r.localId, setId: r.setId, setName: r.setName, image: r.image }))
  writeCache(PREFIX, key, prints)
  return prints
}
