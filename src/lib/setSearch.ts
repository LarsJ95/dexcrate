/** Wat de setsuggesties nodig hebben van een set. */
export interface SetCandidate {
  setId: string
  name: string
  /** Aantal unieke kaarten in bezit. */
  owned: number
  /** Positie in de API-lijst (hoger = nieuwer). */
  order: number
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
const compact = (s: string): string => s.replace(/[^\p{L}\p{N}]/gu, '')

/** Hoe goed past een set bij de zoektekst? Lager = beter; null = past niet. */
function score(c: SetCandidate, q: string): number | null {
  const name = norm(c.name)
  const id = c.setId.toLowerCase()
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (name.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 2
  if (id === q || id.startsWith(q)) return 3
  if (name.includes(q) || compact(name).includes(compact(q))) return 4
  return null
}

/**
 * Beste sets bij een (deel van een) naam: "15" → 151, "evol" → Evolving Skies.
 * `exactId` (bv. gevonden via de afkorting "MEW") komt altijd bovenaan.
 * Bij gelijke score eerst sets die je al hebt, dan nieuwere sets.
 */
export function suggestSets<T extends SetCandidate>(list: readonly T[], query: string, limit = 6, exactId: string | null = null): T[] {
  const q = norm(query)
  if (!q) return []
  const hits: { c: T; s: number }[] = []
  for (const c of list) {
    const s = c.setId === exactId ? -1 : score(c, q)
    if (s !== null) hits.push({ c, s })
  }
  hits.sort((a, b) => a.s - b.s || Number(b.c.owned > 0) - Number(a.c.owned > 0) || b.c.order - a.c.order || a.c.name.length - b.c.name.length)
  return hits.slice(0, limit).map((h) => h.c)
}

/** Lijkt de zoektekst op een setafkorting (MEW, PAF, SV8)? */
export function looksLikeAbbr(query: string): boolean {
  return /^[a-z0-9]{2,5}$/i.test(query.trim())
}
