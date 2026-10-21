import { supabase } from './supabase'
import { LANGS, type Lang } from './tcgdex'
import { patchSettings } from './valuationDb'

/**
 * Sets vastzetten in het menu onder Sets (21-10-2026, op verzoek, idee uit Dex). Alleen wat je zelf vastzet, max. 5;
 * in je account (user_settings.settings.pinned_sets), dus op elk apparaat hetzelfde. Geen SQL-stap nodig.
 */
export const MAX_PINNED = 5

export interface PinnedSet {
  lang: Lang
  setId: string
  name: string
}

/** Korte taalcode achter de naam (twee sets "151" in verschillende talen). */
export const PIN_LANG: Record<Lang, string> = { en: 'EN', ja: 'JP', ko: 'KR', 'zh-cn': 'CHS', 'zh-tw': 'CHT' }

export const pinKey =(p: { lang: string; setId: string }): string => `${p.lang}/${p.setId}`
export const pinHref = (p: { lang: string; setId: string }): string => `#/sets/${p.lang}/${encodeURIComponent(p.setId)}`

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Opgeslagen lijst controleren: geldige taal, set-id en naam, geen dubbele, hoogstens MAX_PINNED. */
export function parsePinned(raw: unknown): PinnedSet[] {
  if (!Array.isArray(raw)) return []
  const out: PinnedSet[] = []
  for (const r of raw) {
    if (!isRecord(r) || typeof r.lang !== 'string' || typeof r.setId !== 'string' || typeof r.name !== 'string') continue
    const lang = r.lang
    if (!(LANGS as readonly string[]).includes(lang)) continue
    const setId = r.setId.trim().slice(0, 60)
    const name = r.name.trim().slice(0, 100) || setId
    if (!setId || out.some((p) => p.lang === lang && p.setId === setId)) continue
    out.push({ lang: lang as Lang, setId, name })
    if (out.length === MAX_PINNED) break
  }
  return out
}

export async function loadPinned(): Promise<PinnedSet[]> {
  const { data, error } = await supabase.from('user_settings').select('settings').maybeSingle()
  if (error) throw new Error(`Loading pinned sets failed: ${error.message}`)
  return parsePinned(isRecord(data) && isRecord(data.settings) ? data.settings.pinned_sets : null)
}

export async function savePinned(list: readonly PinnedSet[]): Promise<void> {
  await patchSettings({ pinned_sets: list.map(({ lang, setId, name }) => ({ lang, setId, name })) })
}

/** Lijst na (los)maken van een set; vol (MAX_PINNED) = ongewijzigd. */
export function withPin(list: readonly PinnedSet[], set: PinnedSet, on: boolean): PinnedSet[] {
  const rest = list.filter((p) => pinKey(p) !== pinKey(set))
  if (!on) return rest
  return rest.length < list.length || list.length >= MAX_PINNED ? [...list] : [...list, set]
}
