import { rarityRule } from './cardTraits'
import { crateSetComplete, hasCrate, syncCrate } from './crate'
import { listCards } from './db'
import { celebrateNewCards, newSince, risenSince, showMoment, type PackCard } from './moments'
import { motionAllowed } from './motion'
import { englishSpeciesName, isNonLatin } from './names'
import { achievements, levelFor, xpFor, type ProgressCard } from './progress'
import { speciesName } from './runner'
import { getCardInfo, getSet, setOfKey, type CardInfo } from './tcgdex'
import type { Card } from './types'

/**
 * Vieringen rond voortgang (DESIGN.md §9). Alles is "nieuw sinds de vorige keer" en per apparaat onthouden;
 * de eerste keer wordt alleen onthouden, zodat bestaande voortgang geen stortvloed aan feestjes geeft.
 */

const LEVEL_KEY = 'dexcrate:trainer-level'
const ACHIEVEMENTS_KEY = 'dexcrate:achievements'
const TRAINER_KEY = 'dexcrate:trainer-name'
const BADGES_KEY = 'dexcrate:badges-earned'

export function rememberTrainerName(name: string): void {
  try {
    localStorage.setItem(TRAINER_KEY, name)
  } catch (err) {
    console.warn('Trainernaam onthouden mislukt', err)
  }
}

function trainerName(): string {
  try {
    return localStorage.getItem(TRAINER_KEY) || 'Trainer'
  } catch {
    return 'Trainer'
  }
}

function badgesEarned(): number {
  try {
    return (localStorage.getItem(BADGES_KEY) ?? '').split(',').filter(Boolean).length
  } catch {
    return 0
  }
}

/** Kaarten in bezit + kaartinfo → invoer voor XP en prestaties. */
export function toProgressCards(cards: readonly Card[], infoOf: (key: string) => CardInfo | null | undefined, valueOf: (c: Card) => number | null = () => null): ProgressCard[] {
  return cards
    .filter((c) => c.ownership === 'owned' && c.kind === 'card')
    .map((c) => {
      const info = c.tcgdex_id ? infoOf(c.tcgdex_id) : null
      return {
        id: c.id,
        name: info?.name ?? c.name,
        quantity: c.quantity,
        dexId: info?.dexId ?? null,
        types: info?.types ?? null,
        rarity: info?.rarity ?? null,
        language: c.language,
        value: valueOf(c),
        createdAt: c.created_at || null,
      }
    })
}

/**
 * Crate points bijwerken (STAP11): kaarten, transacties, nieuwe Pokédex-soorten en de dagbonus.
 * Bonus per kaart naar zeldzaamheid (max. 20). Toont "+N Crate points" als er iets bij kwam.
 */
export async function syncCratePoints(cards: readonly ProgressCard[], reason: string): Promise<void> {
  try {
    if (!(await hasCrate())) return
    const bonus: Record<string, number> = {}
    for (const c of cards) {
      const b = Math.min(20, rarityRule(c.rarity).rank * 2)
      if (b > 0) bonus[c.id] = b
    }
    const result = await syncCrate(
      bonus,
      cards.flatMap((c) => (c.dexId ? [c.dexId] : [])),
    )
    if (result.earned > 0 && motionAllowed()) showMoment({ kind: 'points', amount: result.earned, reason })
  } catch (err) {
    console.warn('Crate points bijwerken mislukt', err)
  }
}

/** Set compleet: 250 Crate points (eenmalig). */
export async function crateForSet(setKey: string, setName: string): Promise<void> {
  try {
    if (!(await hasCrate())) return
    const got = await crateSetComplete(setKey)
    if (got > 0 && motionAllowed()) showMoment({ kind: 'points', amount: got, reason: `${setName} complete` })
  } catch (err) {
    console.warn('Crate points voor de set mislukt', err)
  }
}

/** Level-up en nieuwe verborgen prestaties vieren. */
export function celebrateProgress(cards: readonly ProgressCard[], badges = badgesEarned()): void {
  const { level } = levelFor(xpFor(cards, badges))
  if (risenSince(LEVEL_KEY, level)) showMoment({ kind: 'level', level, trainer: trainerName() })
  const list = achievements(cards)
  const fresh = newSince(
    ACHIEVEMENTS_KEY,
    list.filter((a) => a.earned).map((a) => a.id),
  )
  for (const id of fresh.slice(-1)) {
    const a = list.find((x) => x.id === id)
    if (a) showMoment({ kind: 'achievement', name: a.name, how: a.how })
  }
}

async function englishName(info: CardInfo): Promise<string> {
  const name = speciesName(info.name)
  if (!isNonLatin(name) || !info.dexId) return name
  return (await englishSpeciesName(info.dexId).catch(() => null)) ?? name
}

/**
 * Na het toevoegen van kaarten: één kaart draait om (of wordt gevangen), meerdere worden als pakje geopend.
 * Daarna, achter elkaar: nieuwe Pokédex-soort, bijna-complete set, level en prestaties.
 * Fouten mogen het opslaan nooit hinderen; ze worden alleen gelogd.
 */
export async function celebrateAdded(rows: readonly Card[]): Promise<void> {
  if (!motionAllowed() || rows.length === 0) return
  try {
    const added = rows.filter((c) => c.kind === 'card')
    if (added.length >= 2) {
      const pack: PackCard[] = await Promise.all(
        added.slice(0, 10).map(async (c) => ({ card: c, rarity: c.tcgdex_id ? ((await getCardInfo(c.tcgdex_id).catch(() => null))?.rarity ?? null) : null })),
      )
      pack.sort((a, b) => rarityRule(a.rarity).rank - rarityRule(b.rarity).rank)
      showMoment({ kind: 'pack', cards: pack })
    } else {
      await celebrateNewCards(rows)
    }

    // Alles in bezit, met kaartinfo (meestal al gecachet).
    const all = (await listCards()).filter((c) => c.ownership === 'owned')
    const keys = [...new Set(all.flatMap((c) => (c.tcgdex_id ? [c.tcgdex_id] : [])))]
    const infos = new Map(await Promise.all(keys.map(async (k) => [k, await getCardInfo(k).catch(() => null)] as const)))
    const newIds = new Set(rows.map((r) => r.id))

    // Nieuwe Pokédex-soorten: een soort die je vóór deze kaarten nog niet had.
    const before = new Set(all.filter((c) => !newIds.has(c.id)).flatMap((c) => (c.tcgdex_id ? [infos.get(c.tcgdex_id)?.dexId ?? 0] : [])))
    const freshInfos = [...new Map(rows.flatMap((r) => {
      const info = r.tcgdex_id ? infos.get(r.tcgdex_id) : null
      return info?.dexId && !before.has(info.dexId) ? [[info.dexId, info] as const] : []
    })).values()]
    if (freshInfos[0]?.dexId) {
      showMoment({ kind: 'dex', dexId: freshInfos[0].dexId, name: await englishName(freshInfos[0]), more: freshInfos.length - 1 })
    }

    // Bijna een set compleet (1 tot 3 kaarten te gaan) door deze kaarten.
    for (const setRef of new Map(rows.flatMap((r) => (r.tcgdex_id ? [[setOfKey(r.tcgdex_id)?.setId ?? '', setOfKey(r.tcgdex_id)] as const] : []))).values()) {
      if (!setRef) continue
      const set = await getSet(setRef.lang, setRef.setId).catch(() => null)
      if (!set || set.cards.length === 0) continue
      const have = new Set(keys.filter((k) => k.startsWith(`${setRef.lang}/${setRef.setId}-`)))
      const missing = set.cards.filter((c) => !have.has(`${setRef.lang}/${c.id}`))
      if (missing.length >= 1 && missing.length <= 3) {
        showMoment({ kind: 'almost', setName: set.summary.name, left: missing.length, missing: missing.map((c) => `${c.name} #${c.localId}`) })
        break
      }
    }

    const progress = toProgressCards(all, (k) => infos.get(k))
    celebrateProgress(progress)
    await syncCratePoints(progress, rows.length === 1 ? 'For adding a card' : `For adding ${rows.length} cards`)
  } catch (err) {
    console.warn('Vieringen na toevoegen overgeslagen', err)
  }
}
