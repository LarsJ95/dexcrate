import { useSyncExternalStore } from 'react'

/**
 * Partner-Pokémon: zelf gekozen (een starter) of automatisch (de Pokémon waar je de meeste kaarten van hebt).
 * Per apparaat bewaard. De automatische keuze onthoudt Overview, zodat de partner ook op andere pagina's staat.
 */

export const STARTERS: readonly { dex: number; name: string }[] = [
  { dex: 25, name: 'Pikachu' },
  { dex: 133, name: 'Eevee' },
  { dex: 1, name: 'Bulbasaur' },
  { dex: 4, name: 'Charmander' },
  { dex: 7, name: 'Squirtle' },
  { dex: 152, name: 'Chikorita' },
  { dex: 155, name: 'Cyndaquil' },
  { dex: 158, name: 'Totodile' },
  { dex: 252, name: 'Treecko' },
  { dex: 255, name: 'Torchic' },
  { dex: 258, name: 'Mudkip' },
  { dex: 387, name: 'Turtwig' },
  { dex: 390, name: 'Chimchar' },
  { dex: 393, name: 'Piplup' },
  { dex: 495, name: 'Snivy' },
  { dex: 498, name: 'Tepig' },
  { dex: 501, name: 'Oshawott' },
  { dex: 650, name: 'Chespin' },
  { dex: 653, name: 'Fennekin' },
  { dex: 656, name: 'Froakie' },
  { dex: 722, name: 'Rowlet' },
  { dex: 725, name: 'Litten' },
  { dex: 728, name: 'Popplio' },
  { dex: 810, name: 'Grookey' },
  { dex: 813, name: 'Scorbunny' },
  { dex: 816, name: 'Sobble' },
  { dex: 906, name: 'Sprigatito' },
  { dex: 909, name: 'Fuecoco' },
  { dex: 912, name: 'Quaxly' },
]

const CHOICE_KEY = 'dexcrate:partner'
const AUTO_KEY = 'dexcrate:partner-auto'
const listeners = new Set<() => void>()

export interface PartnerRef {
  dex: number
  name: string
}

function read(key: string): PartnerRef | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return null
    const { dex, name } = v as { dex?: unknown; name?: unknown }
    return typeof dex === 'number' && Number.isInteger(dex) && dex > 0 && dex <= 1025 && typeof name === 'string' ? { dex, name: name.slice(0, 40) } : null
  } catch {
    return null // geen opslag of rommel: geen keuze
  }
}

function write(key: string, v: PartnerRef | null): void {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v))
    else localStorage.removeItem(key)
  } catch (err) {
    console.warn('Partner onthouden mislukt', err)
  }
}

let choice = read(CHOICE_KEY)
let auto = read(AUTO_KEY)
const emit = (): void => {
  for (const l of listeners) l()
}

/** Zelf gekozen partner, of null = automatisch. */
export function setPartnerChoice(v: PartnerRef | null): void {
  choice = v
  write(CHOICE_KEY, v)
  emit()
}

/** De automatische partner (berekend op Overview) onthouden. */
export function rememberAutoPartner(v: PartnerRef): void {
  if (auto?.dex === v.dex && auto.name === v.name) return
  auto = v
  write(AUTO_KEY, v)
  emit()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePartnerChoice(): PartnerRef | null {
  return useSyncExternalStore(subscribe, () => choice, () => null)
}

/** Partner om te tonen: eigen keuze, anders de automatische, anders Pikachu. */
export function usePartner(): PartnerRef {
  const c = useSyncExternalStore(subscribe, () => choice, () => null)
  const a = useSyncExternalStore(subscribe, () => auto, () => null)
  return c ?? a ?? STARTERS[0]
}
