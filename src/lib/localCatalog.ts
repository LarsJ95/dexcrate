import type { EnergyType } from './cardTraits'
import type { CardInfo, SetCard, SetSummary } from './tcgdex'

/**
 * Eigen catalogus voor sets die TCGdex, pokemontcg.io en Limitless niet kennen (gecontroleerd 18-10-2026).
 * Sleutels zoals TCGdex ("en/clc-010"), zodat koppelen, zoeken, scannen, setpagina en Pokédex gewoon werken.
 * Foto's via PriceCharting (CatalogCardPicture); prijzen zijn er niet.
 *
 * Pokémon TCG Classic (17-11-2023): drie decks van 34 kaarten. Kaartlijst van TCGCollector, gecontroleerd tegen
 * PriceCharting; type en Pokédex-nummer van de originele kaart in TCGdex (bv. Voltorb = Base Set 67), voor
 * Lugia ex, Ho-Oh ex, Suicune ex en Mr. Mime (Vending) van TCGCollector.
 */

/** [naam] voor trainers en energie, [naam, type, Pokédex-nummer] voor Pokémon; volgorde = kaartnummer. */
type Row = readonly [name: string] | readonly [name: string, type: EnergyType, dexId: number]

interface LocalSet {
  id: string
  abbr: string
  name: string
  releaseDate: string
  rows: readonly Row[]
}

const SETS: readonly LocalSet[] = [
  {
    id: 'clv',
    abbr: 'CLV',
    name: 'Pokémon TCG Classic (Venusaur)',
    releaseDate: '2023-11-17',
    rows: [
      ['Bulbasaur', 'Grass', 1],
      ['Ivysaur', 'Grass', 2],
      ['Venusaur', 'Grass', 3],
      ['Paras', 'Grass', 46],
      ['Parasect', 'Grass', 47],
      ['Scyther', 'Grass', 123],
      ['Pinsir', 'Grass', 127],
      ['Sandshrew', 'Fighting', 27],
      ['Sandslash', 'Fighting', 28],
      ['Onix', 'Fighting', 95],
      ['Hitmonlee', 'Fighting', 106],
      ['Hitmonchan', 'Fighting', 107],
      ['Doduo', 'Colorless', 84],
      ['Dodrio', 'Colorless', 85],
      ['Chansey', 'Colorless', 113],
      ['Snorlax', 'Colorless', 143],
      ['Lugia ex', 'Colorless', 249],
      ['Bill'],
      ["Boss's Orders"],
      ['Computer Search'],
      ['Poké Ball'],
      ['Pokémon Fan Club'],
      ['Pokémon Nurse'],
      ['Professor Oak'],
      ['Rare Candy'],
      ["Rocket's Admin."],
      ['Sun Seed'],
      ['Super Rod'],
      ['Switch'],
      ['Ultra Ball'],
      ['VS Seeker'],
      ['Double Colorless Energy'],
      ['Grass Energy'],
      ['Fighting Energy'],
    ],
  },
  {
    id: 'clc',
    abbr: 'CLC',
    name: 'Pokémon TCG Classic (Charizard)',
    releaseDate: '2023-11-17',
    rows: [
      ['Charmander', 'Fire', 4],
      ['Charmeleon', 'Fire', 5],
      ['Charizard', 'Fire', 6],
      ['Ponyta', 'Fire', 77],
      ['Rapidash', 'Fire', 78],
      ['Magmar', 'Fire', 126],
      ['Ho-Oh ex', 'Fire', 250],
      ['Pikachu', 'Lightning', 25],
      ['Raichu', 'Lightning', 26],
      ['Voltorb', 'Lightning', 100],
      ['Electrode', 'Lightning', 101],
      ['Zapdos', 'Lightning', 145],
      ['Clefairy', 'Colorless', 35],
      ['Clefable', 'Colorless', 36],
      ['Dunsparce', 'Colorless', 206],
      ['Stantler', 'Colorless', 234],
      ['Miltank', 'Colorless', 241],
      ['Bill'],
      ["Boss's Orders"],
      ['Computer Search'],
      ['Poké Ball'],
      ['Pokémon Fan Club'],
      ['Professor Oak'],
      ['Rare Candy'],
      ["Rocket's Admin."],
      ['Scorching Charcoal'],
      ['Super Rod'],
      ['Super Scoop Up'],
      ['Switch'],
      ['Ultra Ball'],
      ['VS Seeker'],
      ['Double Colorless Energy'],
      ['Fire Energy'],
      ['Lightning Energy'],
    ],
  },
  {
    id: 'clb',
    abbr: 'CLB',
    name: 'Pokémon TCG Classic (Blastoise)',
    releaseDate: '2023-11-17',
    rows: [
      ['Squirtle', 'Water', 7],
      ['Wartortle', 'Water', 8],
      ['Blastoise', 'Water', 9],
      ['Staryu', 'Water', 120],
      ['Starmie', 'Water', 121],
      ['Magikarp', 'Water', 129],
      ['Gyarados', 'Water', 130],
      ['Lapras', 'Water', 131],
      ['Articuno', 'Water', 144],
      ['Suicune ex', 'Water', 245],
      ['Drowzee', 'Psychic', 96],
      ['Hypno', 'Psychic', 97],
      ['Mr. Mime', 'Psychic', 122],
      ['Mewtwo', 'Psychic', 150],
      ["Lt. Surge's Rattata", 'Colorless', 19],
      ["Lt. Surge's Raticate", 'Colorless', 20],
      ['Kangaskhan', 'Colorless', 115],
      ['Bill'],
      ["Boss's Orders"],
      ['Computer Search'],
      ['Drops in the Ocean'],
      ['Fisherman'],
      ['Poké Ball'],
      ['Pokémon Fan Club'],
      ['Professor Oak'],
      ['Rare Candy'],
      ["Rocket's Admin."],
      ['Super Rod'],
      ['Switch'],
      ['Ultra Ball'],
      ['VS Seeker'],
      ['Double Colorless Energy'],
      ['Water Energy'],
      ['Psychic Energy'],
    ],
  },
]

const BY_ID = new Map(SETS.map((s) => [s.id, s]))

/** TCGdex-stijl: "010" (printed 010/034). */
const localIdOf = (i: number): string => String(i + 1).padStart(3, '0')

function summaryOf(s: LocalSet): SetSummary {
  return { id: s.id, name: s.name, logo: null, abbr: s.abbr, total: s.rows.length, official: s.rows.length, releaseDate: s.releaseDate, serieId: null }
}

function cardsOf(s: LocalSet): SetCard[] {
  return s.rows.map((r, i) => ({ id: `${s.id}-${localIdOf(i)}`, localId: localIdOf(i), name: r[0], image: null }))
}

/** Set-id's van de eigen catalogus (alleen Engels). */
export const LOCAL_SET_IDS: ReadonlySet<string> = new Set(BY_ID.keys())

export function localSet(setId: string): { summary: SetSummary; cards: SetCard[] } | null {
  const s = BY_ID.get(setId.toLowerCase())
  return s ? { summary: summaryOf(s), cards: cardsOf(s) } : null
}

/** Gedrukte afkorting ("CLC") → set-id, of null. */
export function localSetIdForAbbr(code: string): string | null {
  const c = code.trim().toUpperCase()
  return SETS.find((s) => s.abbr === c)?.id ?? null
}

export function localSetSummaries(): SetSummary[] {
  return SETS.map(summaryOf)
}

/** Kaarten waarvan de naam de zoekterm bevat (hoofdletterongevoelig, zoals TCGdex); optioneel alleen dit type. */
export function searchLocal(name: string, type?: string): SetCard[] {
  const q = name.trim().toLowerCase()
  if (!q) return []
  return SETS.flatMap((s) =>
    cardsOf(s).filter((c, i) => c.name.toLowerCase().includes(q) && (!type || s.rows[i][1] === type)),
  )
}

/** Kaartinfo voor een sleutel uit de eigen catalogus ("en/clc-010"), of null als het geen eigen kaart is. */
export function localCardInfo(key: string): CardInfo | null {
  const m = /^en\/([a-z]+)-(\d{3})$/.exec(key)
  const s = m ? BY_ID.get(m[1]) : undefined
  const row = s ? s.rows[Number.parseInt(m?.[2] ?? '', 10) - 1] : undefined
  if (!s || !row) return null
  return {
    key,
    lang: 'en',
    name: row[0],
    localId: m?.[2] ?? '',
    image: null,
    tcgplayerId: null,
    variants: null,
    illustrator: null,
    rarity: null,
    types: row[1] ? [row[1]] : [],
    suffix: row[0].endsWith(' ex') ? 'ex' : null,
    dexId: row[2] ?? null,
    game: null,
    set: { id: s.id, name: s.name, logo: null },
  }
}

/** Hoort deze sleutel bij de eigen catalogus? (Dan niets bij TCGdex opvragen.) */
export function isLocalKey(key: string): boolean {
  return /^en\/[a-z]+-/.test(key) && LOCAL_SET_IDS.has(key.slice(3, key.lastIndexOf('-')))
}
