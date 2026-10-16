/**
 * Levende achtergrond (DESIGN.md §9): sterrenhemel, hemel volgens de tijd, vallende sterren, Team Rocket,
 * vliegende Pokémon en Gengar. Dit bestand bevat de pure logica; het tekenen zit in components/Sky.tsx.
 */

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night'

/** Dageraad 5-8 uur, dag 8-18, schemer 18-21, nacht 21-5 (lokale tijd). */
export function skyPhase(date: Date): SkyPhase {
  const h = date.getHours()
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 21) return 'dusk'
  return 'night'
}

/** Hoe zichtbaar de sterren zijn per fase (donker thema; licht thema alleen 's nachts een beetje). */
export function starStrength(phase: SkyPhase, theme: 'dark' | 'light'): number {
  if (theme === 'light') return phase === 'night' ? 0.35 : 0
  return { night: 1, dusk: 0.75, dawn: 0.6, day: 0.45 }[phase]
}

export interface Star {
  x: number
  y: number
  /** Grootte in pixels (1-2). */
  size: number
  /** Basishelderheid 0-1. */
  base: number
  /** Twinkelfase en -snelheid. */
  phase: number
  speed: number
}

/** Ongeveer één ster per 9.000 px², maximaal 600. */
export function makeStars(width: number, height: number, random: () => number = Math.random): Star[] {
  const count = Math.min(600, Math.round((width * height) / 9000))
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    size: random() < 0.85 ? 1 : 2,
    base: 0.25 + random() * 0.6,
    phase: random() * Math.PI * 2,
    speed: 0.4 + random() * 1.4,
  }))
}

/** Helderheid van een ster op tijdstip t (seconden). */
export const twinkle = (s: Star, t: number): number => Math.max(0, Math.min(1, s.base * (0.65 + 0.35 * Math.sin(s.phase + t * s.speed))))

export interface FallingStar {
  x0: number
  y0: number
  dx: number
  dy: number
  /** Starttijd en duur in ms. */
  start: number
  duration: number
}

/** Nieuwe vallende ster: begint in het bovenste deel en valt schuin naar links-onder. */
export function makeFallingStar(width: number, height: number, now: number, random: () => number = Math.random): FallingStar {
  const len = Math.min(width, height) * (0.35 + random() * 0.25)
  return { x0: width * (0.35 + random() * 0.6), y0: height * (0.05 + random() * 0.3), dx: -len * 0.85, dy: len * 0.5, start: now, duration: 2200 }
}

/** Kop van de vallende ster op tijdstip `now`; null als hij (nog) niet zichtbaar is. */
export function fallingHead(f: FallingStar, now: number): { x: number; y: number; progress: number } | null {
  const p = (now - f.start) / f.duration
  if (p < 0 || p > 1) return null
  const e = 1 - (1 - p) ** 2 // remt af
  return { x: f.x0 + f.dx * e, y: f.y0 + f.dy * e, progress: p }
}

/** Raakt een tik de vallende ster (kop of staart)? Ruim, want hij beweegt. Kort na het verdwijnen telt nog. */
export function hitsFallingStar(f: FallingStar, x: number, y: number, now: number, radius = 70, grace = 500): boolean {
  const head = fallingHead(f, Math.min(now, f.start + f.duration))
  if (!head || now > f.start + f.duration + grace) return false
  // Afstand tot het lijnstuk van startpunt tot kop.
  const vx = head.x - f.x0
  const vy = head.y - f.y0
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - f.x0) * vx + (y - f.y0) * vy) / len2))
  const px = f.x0 + vx * t
  const py = f.y0 + vy * t
  return Math.hypot(x - px, y - py) <= radius
}

/** Vliegende Pokémon (Pokédex-nummers) die in de verte langs kunnen komen. */
export const FLYERS: readonly number[] = [6, 18, 142, 144, 145, 146, 149, 249, 250, 330, 334, 373, 380, 381, 384, 468, 635, 643, 644, 715, 717, 823]

/** Liefst een vliegende Pokémon uit je eigen collectie, anders een willekeurige. */
export function pickFlyer(owned: Iterable<number>, random: () => number = Math.random): number {
  const mine = FLYERS.filter((d) => new Set(owned).has(d))
  const list = mine.length > 0 && random() < 0.75 ? mine : FLYERS
  return list[Math.floor(random() * list.length)]
}

/** Willekeurige wachttijd in ms tussen min en max (seconden). */
export const between = (minS: number, maxS: number, random: () => number = Math.random): number => (minS + random() * (maxS - minS)) * 1000

// --- Team Rocket ---

const ROCKET_KEY = 'dexcrate:rocket-blasts'
export const ROCKET_GOAL = 10

export function rocketBlasts(): number {
  try {
    const n = Number.parseInt(localStorage.getItem(ROCKET_KEY) ?? '0', 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Team Rocket nog een keer weggestuurd; geeft het nieuwe totaal. */
export function addRocketBlast(): number {
  const n = rocketBlasts() + 1
  try {
    localStorage.setItem(ROCKET_KEY, String(n))
  } catch (err) {
    console.warn('Team Rocket-teller bewaren mislukt', err)
  }
  return n
}

// --- Preview (alleen preview.html) ---

export type SkyEvent = 'star' | 'rocket' | 'flyer' | 'gengar'
let previewEvent: { kind: SkyEvent | null; phase: SkyPhase | null } | null = null

/** preview.html?sky=rocket&phase=night: gebeurtenis direct starten, eventueel met een vaste fase. */
export function seedSkyForPreview(kind: SkyEvent | null, phase: SkyPhase | null): void {
  previewEvent = { kind, phase }
}

export const previewSky = (): { kind: SkyEvent | null; phase: SkyPhase | null } | null => previewEvent
