import type { ItemInput } from './types'

const API = 'https://api.tcgdex.net/v2'

export type Lang = 'en' | 'ja' | 'zh-cn'

interface SetCard {
  id: string
  localId: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`TCGdex ${res.status} voor ${url}`)
  return res.json()
}

function parseSetCards(data: unknown): SetCard[] {
  if (!isRecord(data) || !Array.isArray(data.cards)) return []
  return data.cards.flatMap((c: unknown) =>
    isRecord(c) && typeof c.id === 'string' && typeof c.localId === 'string' ? [{ id: c.id, localId: c.localId }] : [],
  )
}

/** Taal uit de naam afleiden: de Excel markeert buitenlandse kaarten met "JAPAN" / "CHINA". */
export function langFromName(name: string): Lang {
  if (/\bjapan\b/i.test(name)) return 'ja'
  if (/\bchina\b/i.test(name)) return 'zh-cn'
  return 'en'
}

async function fetchSetCards(lang: Lang, code: string): Promise<SetCard[]> {
  const safe = encodeURIComponent(code)
  if (lang !== 'en') return parseSetCards(await getJson(`${API}/${lang}/sets/${safe}`))
  // Engelse sets: Excel gebruikt de officiële afkorting (MEW, OBF, ...).
  const found = await getJson(`${API}/en/sets?abbreviation.official=eq:${safe}`)
  if (!Array.isArray(found) || found.length !== 1 || !isRecord(found[0]) || typeof found[0].id !== 'string') return []
  return parseSetCards(await getJson(`${API}/en/sets/${encodeURIComponent(found[0].id)}`))
}

function matchCard(cards: SetCard[], number: string): SetCard | undefined {
  const exact = cards.find((c) => c.localId === number)
  if (exact) return exact
  const n = Number.parseInt(number, 10)
  if (Number.isNaN(n)) return undefined
  const numeric = cards.filter((c) => Number.parseInt(c.localId, 10) === n)
  return numeric.length === 1 ? numeric[0] : undefined
}

/**
 * Koppelt elke kaart aan een TCGdex-id ("<taal>/<kaart-id>").
 * Geeft nieuwe objecten terug; ongematchte kaarten houden tcgdex_id null.
 */
export async function resolveTcgdexIds<T extends ItemInput>(items: readonly T[]): Promise<T[]> {
  const cache = new Map<string, Promise<SetCard[]>>()
  const setCards = (lang: Lang, code: string): Promise<SetCard[]> => {
    const key = `${lang}|${code}`
    let p = cache.get(key)
    if (!p) {
      p = fetchSetCards(lang, code).catch((err: unknown) => {
        console.error(`Set ${code} (${lang}) ophalen mislukt`, err)
        return []
      })
      cache.set(key, p)
    }
    return p
  }

  return Promise.all(
    items.map(async (it) => {
      if (it.kind !== 'card' || !it.set_code || !it.card_number) return it
      const lang = langFromName(it.name)
      const card = matchCard(await setCards(lang, it.set_code), it.card_number)
      return card ? { ...it, tcgdex_id: `${lang}/${card.id}` } : it
    }),
  )
}
