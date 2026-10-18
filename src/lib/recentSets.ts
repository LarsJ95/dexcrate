// Laatst bezochte sets (per apparaat), als snelkoppelingen onder "Sets" in het menu.

export interface RecentSet {
  lang: string
  setId: string
  name: string
}

const KEY = 'dexcrate:recent-sets'
export const MAX_RECENT_SETS = 3
/** Event zodat het menu meteen bijwerkt na het openen van een set (zelfde tabblad). */
export const RECENT_SETS_EVENT = 'dexcrate:recent-sets'

function isRecent(v: unknown): v is RecentSet {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.lang === 'string' && typeof o.setId === 'string' && typeof o.name === 'string' && o.lang !== '' && o.setId !== ''
}

/** Opgeslagen lijst inlezen; kapot of leeg = geen recente sets. */
export function parseRecentSets(raw: string | null): RecentSet[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(isRecent).slice(0, MAX_RECENT_SETS) : []
  } catch {
    return []
  }
}

/** Nieuwste vooraan, zonder dubbele, hooguit drie. */
export function addRecentSet(list: readonly RecentSet[], set: RecentSet): RecentSet[] {
  const rest = list.filter((s) => !(s.lang === set.lang && s.setId === set.setId))
  return [{ lang: set.lang, setId: set.setId, name: set.name.slice(0, 60) }, ...rest].slice(0, MAX_RECENT_SETS)
}

export function readRecentSets(): RecentSet[] {
  try {
    return parseRecentSets(localStorage.getItem(KEY))
  } catch {
    return [] // geen opslag (privévenster): geen snelkoppelingen
  }
}

export function rememberRecentSet(set: RecentSet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(addRecentSet(readRecentSets(), set)))
    window.dispatchEvent(new Event(RECENT_SETS_EVENT))
  } catch (err) {
    console.warn('Recente set onthouden mislukt', err)
  }
}

export const recentSetHref = (s: RecentSet): string => `#/sets/${s.lang}/${encodeURIComponent(s.setId)}`
