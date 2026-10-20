import { autoPick, findScanCandidates, type Candidate } from './match'
import { scanQuery, type Recognition } from './scanResult'
import { getCardInfo, lookupLang } from './tcgdex'

/**
 * Leren van je keuzes bij het scannen (STAP20). Kies je een andere kaart dan de app voorstelde, dan wordt dat
 * onthouden voor dezelfde lezing (taal, setcode, nummer, naam); de volgende keer staat die kaart bovenaan.
 * Opgeslagen in je account (tabel scan_choices, alle apparaten); zonder STAP20 of zonder internet op dit apparaat.
 * Onthouden mag scannen en toevoegen nooit laten mislukken: fouten worden gelogd, niet gegooid.
 */

const TABLE = 'scan_choices'
/** Zoveel keuzes op dit apparaat (de nieuwste). */
const MAX_LOCAL = 500
const localKey = (userId: string): string => `dexcrate:scan-memory:${userId}`

/** Lezing als sleutel ("zh-cn|CSMC|4|dedenne"); null zonder setcode én nummer (te vaag om op te bouwen) of zonder naam. */
export function readKey(r: Pick<Recognition, 'language' | 'setCode' | 'cardNumber' | 'nameEnglish' | 'namePrinted'>): string | null {
  const set = r.setCode.trim().toUpperCase()
  const num = r.cardNumber
    .replace(/\s+/g, '')
    .replace(/^0+(?=.)/, '')
    .toUpperCase()
  if (!set && !num) return null
  const name = (r.nameEnglish || r.namePrinted)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
  if (!name) return null
  return `${lookupLang(r.language)}|${set}|${num}|${name}`.slice(0, 300)
}

interface Store {
  userId: string
  choices: Map<string, string>
  /** Tabel bereikbaar (STAP20 gedraaid, online). */
  db: boolean
}

/** Per ingelogde gebruiker één keer laden; ander account in hetzelfde tabblad → opnieuw. */
let cached: { userId: string; store: Promise<Store> } | null = null

function readLocal(userId: string): Map<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(localKey(userId)) ?? '[]')
    return new Map(Array.isArray(raw) ? raw.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') : [])
  } catch {
    return new Map() // geen opslag of kapotte waarde: opnieuw beginnen
  }
}

function writeLocal(s: Store): void {
  try {
    localStorage.setItem(localKey(s.userId), JSON.stringify([...s.choices].slice(-MAX_LOCAL)))
  } catch (err) {
    console.warn('Scan-keuzes op dit apparaat bewaren mislukt', err)
  }
}

const missingTable = (code: string | undefined): boolean => code === '42P01' || code === 'PGRST205'

/** Keuzes uit je account (bron van waarheid); lukt dat niet (STAP20 ontbreekt, offline), die op dit apparaat. */
async function load(userId: string): Promise<Store> {
  const s: Store = { userId, choices: readLocal(userId), db: false }
  try {
    const { supabase } = await import('./supabase')
    const { data: rows, error } = await supabase.from(TABLE).select('read_key, card_key').limit(5000)
    if (error) {
      if (!missingTable(error.code)) console.warn('Scan-keuzes laden mislukt', error.message)
      return s
    }
    s.choices = new Map((rows ?? []).map((r: { read_key: string; card_key: string }) => [r.read_key, r.card_key]))
    s.db = true
    writeLocal(s)
  } catch (err) {
    console.warn('Scan-keuzes laden mislukt', err)
  }
  return s
}

async function getStore(): Promise<Store | null> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return null
  if (!cached || cached.userId !== userId) cached = { userId, store: load(userId) }
  return cached.store
}

/** Een eerder gekozen kaart als kandidaat, ook als hij niet tussen de gevonden kaarten zat. */
async function candidateFor(key: string, found: readonly Candidate[]): Promise<Candidate | null> {
  const existing = found.find((c) => c.key === key)
  if (existing) return existing
  const info = await getCardInfo(key).catch((err: unknown) => {
    console.warn(`Eerder gekozen kaart ${key} ophalen mislukt`, err)
    return null
  })
  return info ? { key, name: info.name, localId: info.localId, setId: info.set.id, setName: info.set.name, image: info.image, score: 0, reason: '' } : null
}

/** Kandidaten met je eerdere keuze voor deze lezing bovenaan (als die anders is dan wat de app zelf zou kiezen). */
export async function withMemory(r: Recognition, found: Candidate[]): Promise<Candidate[]> {
  const key = readKey(r)
  if (!key) return found
  const chosen = (await getStore().catch((err: unknown) => {
    console.warn('Scan-keuzes niet beschikbaar', err)
    return null
  }))?.choices.get(key)
  if (!chosen || autoPick(found)?.key === chosen) return found
  const c = await candidateFor(chosen, found)
  if (!c) return found
  const { otherNumber: _other, nameDiffers: _name, ...rest } = c
  void _other
  void _name
  const top: Candidate = { ...rest, score: Math.max(c.score, ...found.map((f) => f.score)) + 1, reason: 'Your earlier choice', remembered: true }
  return [top, ...found.filter((f) => f.key !== chosen)].slice(0, 12)
}

/** Kandidaten voor een herkende kaart: catalogus (met taal-terugval) plus je eerdere keuze. */
export async function scanCandidates(r: Recognition): Promise<Candidate[]> {
  return withMemory(r, await findScanCandidates(scanQuery(r), lookupLang(r.language)))
}

export interface ChoiceInput {
  rec: Recognition | null
  candidates: readonly Candidate[]
  /** Toegevoegde kaart; null = zonder koppeling (wordt niet onthouden). */
  chosen: string | null
}

/**
 * Keuzes na toevoegen onthouden: andere kaart dan de app zelf koos → opslaan; terug naar de keuze van de app →
 * de oude keuze vergeten. Zonder koppeling: niets.
 */
export async function recordChoices(items: readonly ChoiceInput[]): Promise<void> {
  try {
    const s = await getStore()
    if (!s) return
    const save: { user_id: string; read_key: string; card_key: string; updated_at: string }[] = []
    const forget: string[] = []
    for (const { rec, candidates, chosen } of items) {
      const key = rec ? readKey(rec) : null
      if (!key || !chosen) continue
      // Wat de app zonder je eerdere keuze zou kiezen.
      const own = autoPick(candidates.filter((c) => !c.remembered))?.key ?? null
      if (chosen !== own) {
        s.choices.delete(key) // opnieuw achteraan: nieuwste blijft bewaard
        s.choices.set(key, chosen)
        save.push({ user_id: s.userId, read_key: key, card_key: chosen, updated_at: new Date().toISOString() })
      } else if (s.choices.delete(key)) {
        forget.push(key)
      }
    }
    if (save.length === 0 && forget.length === 0) return
    writeLocal(s)
    if (!s.db) return
    const { supabase } = await import('./supabase')
    if (save.length > 0) {
      const { error } = await supabase.from(TABLE).upsert(save, { onConflict: 'user_id,read_key' })
      if (error) console.warn('Scan-keuzes opslaan mislukt', error.message)
    }
    if (forget.length > 0) {
      const { error } = await supabase.from(TABLE).delete().in('read_key', forget)
      if (error) console.warn('Scan-keuzes vergeten mislukt', error.message)
    }
  } catch (err) {
    console.warn('Scan-keuzes bijwerken mislukt', err)
  }
}

/** Alleen voor tests: opnieuw laden. */
export function resetScanMemoryForTests(): void {
  cached = null
}
