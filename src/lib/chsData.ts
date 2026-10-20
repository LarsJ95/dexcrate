import { rarityRule, type EnergyType } from './cardTraits'
import type { Variant } from './types'

/**
 * Vereenvoudigd-Chinese kaartdata (PTCG-CHS-Datasets, github.com/duanxr/PTCG-CHS-Datasets) omzetten naar een
 * compacte catalogus. Puur, zodat de omzetting in een Web Worker kan draaien (het bronbestand is ±27 MB).
 * Gecontroleerd 20-10-2026: 236 producten, 23.250 regels; elke uitvoering (gewoon, ★ spiegel, ★★ bal-spiegel) is
 * een eigen regel met hetzelfde nummer.
 */

export interface ChsCard {
  /** Zoals gedrukt zonder totaal: "062", Gem Pack "1101" (soort 11, uitvoering 01; gedrukt "11 01/07"). */
  localId: string
  name: string
  dexId: number | null
  type: EnergyType | null
  /** TCGdex-naam van de zeldzaamheid ("Double rare"), of null. */
  rarity: string | null
  /** Bekende uitvoeringen; null = onbekend (alles toegestaan). */
  variants: Variant[] | null
  /** Pad in de dataset ("img/482/155.png"), of null. */
  img: string | null
  illustrator: string | null
}

export interface ChsSet {
  /** Productcode zoals gedrukt en zoals TCGdex hem gebruikt ("CSV9.5C"). */
  id: string
  name: string
  releaseDate: string | null
  /** Getal na de schuine streep bij de meeste kaarten ("208"), of null. */
  official: number | null
  cards: ChsCard[]
}

/** attribute in de dataset (woordenboek "attribute": 草 火 水 雷 超 斗 恶 钢 妖 龙 无色). */
const TYPES: Record<string, EnergyType> = {
  '1': 'Grass',
  '2': 'Fire',
  '3': 'Water',
  '4': 'Lightning',
  '5': 'Psychic',
  '6': 'Fighting',
  '7': 'Darkness',
  '8': 'Metal',
  '9': 'Fairy',
  '10': 'Dragon',
  '11': 'Colorless',
}

/** Japanse/Chinese zeldzaamheidscodes → TCGdex-namen (cardTraits). Onbekend (RRR, PR, Gem Pack-tekens) = null. */
const RARITIES: Record<string, string> = {
  C: 'Common',
  U: 'Uncommon',
  R: 'Rare',
  RR: 'Double rare',
  AR: 'Illustration rare',
  CHR: 'Illustration rare',
  CSR: 'Illustration rare',
  SAR: 'Special illustration rare',
  SR: 'Ultra Rare',
  UR: 'Hyper rare',
  HR: 'Hyper rare',
  S: 'Shiny rare',
  SSR: 'Shiny ultra rare',
  ACE: 'ACE SPEC Rare',
  K: 'Radiant Rare',
  A: 'Amazing Rare',
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** "062/208" → "062"; "11 01/07" → "1101"; zonder cijfers (bv. "SV-P") → null. */
export function chsLocalId(collectionNumber: string): string | null {
  const id = collectionNumber.split('/')[0].replace(/\s+/g, '')
  return /^\d+$/.test(id) ? id : null
}

/** "C★★" → { code: "C", mirrors: 2 }; "无标记✦" → { code: "无标记", mirrors: 1 }. */
function splitRarity(text: string): { code: string; mirrors: number } {
  const m = /^(.*?)([★✦✧◇]*)$/u.exec(text.trim())
  const code = m?.[1] ?? ''
  // Gem Packs gebruiken alleen tekens (●, ◆, ★): dat is geen spiegeluitvoering.
  return code ? { code, mirrors: [...(m?.[2] ?? '')].length } : { code: text.trim(), mirrors: 0 }
}

function variantsFor(rarity: string | null, hasMirror: boolean): Variant[] | null {
  const rank = rarityRule(rarity).rank
  if (hasMirror && rank > 0 && rank <= 2) return ['normal', 'reverse']
  if (!hasMirror && rank >= 5) return ['holo']
  return null
}

/** Meest voorkomende getal na de schuine streep, of null. */
function officialOf(numbers: readonly string[]): number | null {
  const counts = new Map<number, number>()
  for (const n of numbers) {
    const m = /^\d+\/(\d+)$/.exec(n.trim())
    if (m) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

interface Row {
  localId: string
  name: string
  dex: number | null
  type: EnergyType | null
  code: string
  mirrors: number
  img: string | null
  illustrator: string | null
}

function toRow(k: unknown): Row | null {
  if (!isRecord(k) || !isRecord(k.details)) return null
  const d = k.details
  const localId = chsLocalId(str(d.collectionNumber))
  const name = str(k.name) || str(d.cardName)
  if (!localId || !name) return null
  const dex = Number.parseInt(str(d.pokedexCode), 10)
  const { code, mirrors } = splitRarity(str(d.rarityText))
  const illustrators = Array.isArray(d.illustratorName) ? d.illustratorName.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  return {
    localId,
    name,
    dex: Number.isInteger(dex) && dex > 0 && dex < 10000 ? dex : null,
    type: str(d.cardType) === '1' ? (TYPES[str(d.attribute)] ?? null) : null,
    code,
    mirrors,
    img: str(k.image) || null,
    illustrator: illustrators[0]?.trim() ?? null,
  }
}

/** Naam zonder "ex"/"V" en zonder eigenaar ("玛俐的"), om ontbrekende Pokédex-nummers aan te vullen. */
const speciesKey = (name: string): string => {
  const n = name.replace(/\s+/g, '').replace(/(ex|EX|GX|VMAX|VSTAR|V)$/, '')
  const i = n.lastIndexOf('的')
  return i > 0 && i < n.length - 1 ? n.slice(i + 1) : n
}

/** Bronbestand → compacte sets. Onbekende vorm → lege lijst (de aanroeper meldt dat). */
export function compactDataset(raw: unknown): ChsSet[] {
  if (!isRecord(raw) || !Array.isArray(raw.collections)) return []
  const sets: { set: ChsSet; rows: Map<string, Row[]> }[] = []
  const dexByName = new Map<string, number>()
  for (const c of raw.collections) {
    if (!isRecord(c) || !Array.isArray(c.cards)) continue
    const id = str(c.commodityCode)
    if (!id) continue
    const rows = new Map<string, Row[]>()
    const numbers: string[] = []
    for (const k of c.cards) {
      const row = toRow(k)
      if (!row) continue
      if (isRecord(k) && isRecord(k.details)) numbers.push(str(k.details.collectionNumber))
      if (row.dex) dexByName.set(speciesKey(row.name), row.dex)
      rows.set(row.localId, [...(rows.get(row.localId) ?? []), row])
    }
    if (rows.size === 0) continue
    const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(str(c.salesDate)) ? str(c.salesDate) : null
    // "补充包 太晶盛聚" (booster) → "太晶盛聚", zoals TCGdex de set noemt; andere producttypes blijven in de naam.
    const name = str(c.name).replace(/^补充包\s*/, '') || id
    sets.push({ set: { id, name, releaseDate, official: officialOf(numbers), cards: [] }, rows })
  }
  return sets.map(({ set, rows }) => {
    const cards = [...rows.values()].map((group): ChsCard => {
      const base = [...group].sort((a, b) => a.mirrors - b.mirrors)[0]
      const rarity = RARITIES[base.code] ?? null
      return {
        localId: base.localId,
        name: base.name,
        // Bv. "太阳伊布ex" heeft geen Pokédex-nummer in de bron; "太阳伊布" wel.
        dexId: base.dex ?? (base.type ? (dexByName.get(speciesKey(base.name)) ?? null) : null),
        type: base.type,
        rarity,
        variants: variantsFor(rarity, group.some((r) => r.mirrors > 0)),
        img: base.img,
        illustrator: base.illustrator,
      }
    })
    cards.sort((a, b) => Number(a.localId) - Number(b.localId) || a.localId.localeCompare(b.localId))
    return { ...set, cards }
  })
}
