/**
 * Uitleg per scanmodus alleen tot je die modus één keer gebruikt hebt (audit S5, 20-10-2026): daarna weet je hoe
 * het werkt en kost de tekst alleen ruimte. Per apparaat; zonder opslag blijft de uitleg gewoon staan.
 */

const KEY = 'dexcrate:scan-hints-seen'

export function readSeenHints(): ReadonlySet<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set() // geen opslag of onleesbaar: uitleg tonen
  }
}

/** Modus gebruikt (foto gemaakt of gekozen): uitleg voortaan weglaten. Geeft de nieuwe set terug. */
export function markHintSeen(mode: string): ReadonlySet<string> {
  const next = new Set(readSeenHints()).add(mode)
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch (err) {
    console.warn('Scanuitleg onthouden mislukt', err)
  }
  return next
}
