import type { EnergyType } from './cardTraits'
import type { CardInfo, Lang, SetCard, SetSummary } from './tcgdex'

/**
 * Eigen catalogus voor sets die TCGdex, pokemontcg.io en Limitless niet kennen, of alleen zonder kaartenlijst.
 * Sleutels zoals TCGdex ("en/clc-010", "zh-cn/CSMC-004"), zodat koppelen, zoeken, scannen, setpagina en Pokédex
 * gewoon werken. Foto's via PriceCharting (CatalogCardPicture); prijzen zijn er niet.
 *
 * Pokémon TCG Classic (17-11-2023): drie decks van 34 kaarten. Kaartlijst van TCGCollector, gecontroleerd tegen
 * PriceCharting; type en Pokédex-nummer van de originele kaart in TCGdex (bv. Voltorb = Base Set 67), voor
 * Lugia ex, Ho-Oh ex, Suicune ex en Mr. Mime (Vending) van TCGCollector.
 *
 * Vereenvoudigd Chinees (19-10-2026), Pokédex-nummers van PokeAPI, energietype onbekend (staat in geen bron):
 * - CSMC (Pokémon Card Display Set Gift Box Charizard, 18-06-2024): 001–012 volgens Cardmarket, per kaart bevestigd
 *   door losse advertenties; 013 Pikachu (willekeurige extra, "013/012") volgens NipponTCG en GS Gameon.
 *   TCGdex kent deze set niet.
 * - CBB3C / CBB4C (Gem Pack Vol. 3 en 4): PriceCharting en pikaqian, alle nummers en namen gelijk (Vol. 4: 147 van de
 *   196 ook bij PriceCharting). Nummer = soort + uitvoering ("1401" = soort 14, uitvoering 01, gedrukt "14 01/07").
 *   TCGdex kent deze sets wel, maar zonder kaarten; deze lijst gaat voor.
 */

/** [naam] voor trainers en energie, [naam, type, Pokédex-nummer] voor Pokémon; volgorde = kaartnummer. */
type Row = readonly [name: string] | readonly [name: string, type: EnergyType, dexId: number]

interface LocalCard {
  localId: string
  name: string
  /** Energietype; null = trainer, energie of onbekend. */
  type: EnergyType | null
  dexId: number | null
}

interface LocalSet {
  lang: Lang
  id: string
  abbr: string
  name: string
  releaseDate: string
  cards: readonly LocalCard[]
}

/** Rijen in volgorde, genummerd 001, 002 … (Pokémon TCG Classic). */
function numbered(rows: readonly Row[]): LocalCard[] {
  return rows.map((r, i) => ({ localId: String(i + 1).padStart(3, '0'), name: r[0], type: r[1] ?? null, dexId: r[2] ?? null }))
}

/** Eén kaart met eigen nummer; type onbekend. */
function card(localId: string, name: string, dexId: number | null = null): LocalCard {
  return { localId, name, type: null, dexId }
}

/**
 * Gem Pack-soort: uitvoeringen 01–07 (gewoon, Pokéball, Stars, Rotary, Master Ball, Stamped, full art).
 * `last`: naam van uitvoering 07 als die anders is (bv. "Clefable ex").
 */
function gemSpecies(no: number, name: string, dexId: number, last = name): LocalCard[] {
  const prefix = String(no).padStart(2, '0')
  return Array.from({ length: 7 }, (_, i) => card(`${prefix}${String(i + 1).padStart(2, '0')}`, i === 6 ? last : name, dexId))
}

const SETS: readonly LocalSet[] = [
  {
    lang: 'en',
    id: 'clv',
    abbr: 'CLV',
    name: 'Pokémon TCG Classic (Venusaur)',
    releaseDate: '2023-11-17',
    cards: numbered([
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
    ]),
  },
  {
    lang: 'en',
    id: 'clc',
    abbr: 'CLC',
    name: 'Pokémon TCG Classic (Charizard)',
    releaseDate: '2023-11-17',
    cards: numbered([
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
    ]),
  },
  {
    lang: 'en',
    id: 'clb',
    abbr: 'CLB',
    name: 'Pokémon TCG Classic (Blastoise)',
    releaseDate: '2023-11-17',
    cards: numbered([
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
    ]),
  },
  {
    lang: 'zh-cn',
    id: 'CSMC',
    abbr: 'CSMC',
    name: 'Pokémon Card Display Set Gift Box Charizard',
    releaseDate: '2024-06-18',
    cards: [
      card('001', 'Charizard', 6),
      card('002', 'Flaaffy', 180),
      card('003', 'Zekrom', 644),
      card('004', 'Dedenne', 702),
      card('005', 'Alcremie', 869),
      card('006', 'Wyrdeer', 899),
      card('007', 'Kleavor', 900),
      card('008', 'Ariados', 168),
      card('009', 'Spiritomb', 442),
      card('010', 'Galarian Obstagoon', 862),
      card('011', 'Druddigon', 621),
      card('012', 'Hoothoot', 163),
      card('013', 'Pikachu', 25),
    ],
  },
  {
    lang: 'zh-cn',
    id: 'CBB3C',
    abbr: 'CBB3C',
    name: 'Gem Pack Vol. 3',
    releaseDate: '2025-09-26',
    cards: [
      ...gemSpecies(1, 'Clefable', 36, 'Clefable ex'),
      ...gemSpecies(2, 'Meowth', 52),
      ...gemSpecies(3, 'Gengar', 94),
      ...gemSpecies(4, 'Cubone', 104),
      ...gemSpecies(5, 'Houndoom', 229, 'Houndoom ex'),
      ...gemSpecies(6, 'Gardevoir', 282, 'Gardevoir ex'),
      ...gemSpecies(7, 'Banette', 354, 'Banette ex'),
      ...gemSpecies(8, 'Absol', 359, 'Absol ex'),
      ...gemSpecies(9, 'Mismagius', 429),
      ...gemSpecies(10, 'Darkrai', 491, 'Darkrai ex'),
      ...gemSpecies(11, 'Chandelure', 609),
      ...gemSpecies(12, 'Lycanroc', 745, 'Lycanroc ex'),
      ...gemSpecies(13, 'Mimikyu', 778),
      ...gemSpecies(14, 'Morpeko', 877),
      ...gemSpecies(15, 'Ceruledge', 937),
      ...gemSpecies(16, 'Greavard', 971),
      ...gemSpecies(17, 'Houndstone', 972, 'Houndstone ex'),
      ...gemSpecies(18, 'Annihilape', 979, 'Annihilape ex'),
      card('1901', 'Super Rod'),
      card('1902', 'Nest Ball'),
      card('1903', 'Switch'),
      card('1904', 'Arven'),
      card('2001', 'Fighting Energy'),
      card('2002', 'Metal Energy'),
      card('2003', 'Luminous Energy'),
      card('2004', 'Fighting Energy'),
      card('2005', 'Metal Energy'),
      card('2006', 'Luminous Energy'),
    ],
  },
  {
    lang: 'zh-cn',
    id: 'CBB4C',
    abbr: 'CBB4C',
    name: 'Gem Pack Vol. 4',
    releaseDate: '2026-02-26',
    cards: [
      ...gemSpecies(1, 'Ponyta', 77),
      ...gemSpecies(2, 'Lickitung', 108),
      ...gemSpecies(3, 'Pinsir', 127),
      ...gemSpecies(4, 'Eevee', 133),
      ...gemSpecies(5, 'Paldean Wooper', 194),
      ...gemSpecies(6, 'Torkoal', 324),
      ...gemSpecies(7, 'Relicanth', 369),
      ...gemSpecies(8, 'Grotle', 388),
      ...gemSpecies(9, 'Infernape', 392),
      ...gemSpecies(10, 'Chatot', 441),
      ...gemSpecies(11, 'Probopass', 476),
      ...gemSpecies(12, 'Froslass', 478),
      ...gemSpecies(13, 'Phione', 489),
      ...gemSpecies(14, 'Excadrill', 530),
      ...gemSpecies(15, 'Minccino', 572),
      ...gemSpecies(16, 'Cinccino', 573),
      ...gemSpecies(17, 'Deerling', 585),
      ...gemSpecies(18, 'Sawsbuck', 586),
      ...gemSpecies(19, 'Heliolisk', 695),
      ...gemSpecies(20, 'Litten', 725),
      ...gemSpecies(21, 'Charjabug', 737),
      ...gemSpecies(22, 'Cutiefly', 742),
      ...gemSpecies(23, 'Mudsdale', 750),
      ...gemSpecies(24, 'Meltan', 808),
      ...gemSpecies(25, 'Cramorant', 845),
      ...gemSpecies(26, 'Snom', 872),
      ...gemSpecies(27, 'Enamorus', 905),
      ...gemSpecies(28, 'Flutter Mane', 987),
    ],
  },
]

/** Set-id's: Engels kleine letters (zoals TCGdex), Aziatisch zoals gedrukt; daarom zoeken zonder hoofdletters. */
const keyOf = (lang: string, setId: string): string => `${lang}|${setId.toLowerCase()}`
const BY_KEY = new Map(SETS.map((s) => [keyOf(s.lang, s.id), s]))

function summaryOf(s: LocalSet): SetSummary {
  return { id: s.id, name: s.name, logo: null, abbr: s.abbr, total: s.cards.length, official: s.cards.length, releaseDate: s.releaseDate, serieId: null }
}

function cardsOf(s: LocalSet): SetCard[] {
  return s.cards.map((c) => ({ id: `${s.id}-${c.localId}`, localId: c.localId, name: c.name, image: null }))
}

/** Set-id's van de eigen catalogus (alleen Engels; o.a. voor de Crate en Engelse plaatjesbronnen). */
export const LOCAL_SET_IDS: ReadonlySet<string> = new Set(SETS.filter((s) => s.lang === 'en').map((s) => s.id))

/** Set uit de eigen catalogus (hoofdletterongevoelig), of null. */
export function localSet(setId: string, lang: Lang = 'en'): { summary: SetSummary; cards: SetCard[] } | null {
  const s = BY_KEY.get(keyOf(lang, setId.trim()))
  return s ? { summary: summaryOf(s), cards: cardsOf(s) } : null
}

/** Gedrukte afkorting ("CLC") → set-id, of null. */
export function localSetIdForAbbr(code: string, lang: Lang = 'en'): string | null {
  const c = code.trim().toUpperCase()
  return SETS.find((s) => s.lang === lang && s.abbr.toUpperCase() === c)?.id ?? null
}

export function localSetSummaries(lang: Lang = 'en'): SetSummary[] {
  return SETS.filter((s) => s.lang === lang).map(summaryOf)
}

/** Kaarten waarvan de naam (Engels) de zoekterm bevat, hoofdletterongevoelig zoals TCGdex; optioneel alleen dit type. */
export function searchLocal(name: string, type?: string, lang: Lang = 'en'): SetCard[] {
  const q = name.trim().toLowerCase()
  if (!q) return []
  return SETS.filter((s) => s.lang === lang).flatMap((s) =>
    s.cards.filter((c) => c.name.toLowerCase().includes(q) && (!type || c.type === type)).map((c) => ({ id: `${s.id}-${c.localId}`, localId: c.localId, name: c.name, image: null })),
  )
}

/** "zh-cn/CSMC-004" → set en kaart uit de eigen catalogus, of null. */
function findLocal(key: string): { set: LocalSet; card: LocalCard; lang: string } | null {
  const slash = key.indexOf('/')
  const dash = key.lastIndexOf('-')
  if (slash < 1 || dash <= slash + 1) return null
  const lang = key.slice(0, slash)
  const set = BY_KEY.get(keyOf(lang, key.slice(slash + 1, dash)))
  // Alleen de echte schrijfwijze van het set-id: sleutels moeten eenduidig blijven.
  if (!set || set.id !== key.slice(slash + 1, dash)) return null
  const card = set.cards.find((c) => c.localId === key.slice(dash + 1))
  return card ? { set, card, lang } : null
}

/** Kaartinfo voor een sleutel uit de eigen catalogus ("en/clc-010"), of null als het geen eigen kaart is. */
export function localCardInfo(key: string): CardInfo | null {
  const found = findLocal(key)
  if (!found) return null
  const { set, card: c } = found
  return {
    key,
    lang: set.lang,
    name: c.name,
    localId: c.localId,
    image: null,
    tcgplayerId: null,
    variants: null,
    illustrator: null,
    rarity: null,
    types: c.type ? [c.type] : [],
    suffix: c.name.endsWith(' ex') ? 'ex' : null,
    dexId: c.dexId,
    game: null,
    set: { id: set.id, name: set.name, logo: null },
  }
}

/** Hoort deze sleutel bij een set uit de eigen catalogus? (Dan niets bij TCGdex opvragen.) */
export function isLocalKey(key: string): boolean {
  const slash = key.indexOf('/')
  const dash = key.lastIndexOf('-')
  if (slash < 1 || dash <= slash + 1) return false
  const set = BY_KEY.get(keyOf(key.slice(0, slash), key.slice(slash + 1, dash)))
  return set !== undefined && set.id === key.slice(slash + 1, dash)
}
