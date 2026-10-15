import { parsePrice } from './excel'

const MAX_AMOUNT = 1_000_000

/** Bedragveld uit een formulier: leeg = onbekend (null), anders een geldig bedrag ≥ 0. */
export function parseMoney(raw: string, label: string): { value: number | null } | { error: string } {
  if (!raw.trim()) return { value: null }
  const p = parsePrice(raw)
  if (p === null || p > MAX_AMOUNT) return { error: `Enter a valid ${label}, e.g. 4.95, or leave it empty if unknown.` }
  return { value: p }
}

/** Bedrag terug naar invoertekst (2 decimalen); null = leeg. */
export const moneyText = (n: number | null): string => (n === null ? '' : n.toFixed(2))

export const today = (): string => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in lokale tijd
