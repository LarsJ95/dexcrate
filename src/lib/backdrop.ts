import type { EnergyType } from './cardTraits'
import { ENERGY_GLYPHS } from './energy'

/**
 * Achtergrond van het donkere thema (DESIGN.md §9): elke dag een andere uit deze rij (17-10-2026, op verzoek).
 * De CSS kijkt naar data-backdrop op <html> (styles/65-achtergronden.css).
 */
export const BACKDROPS = ['pokeballs', 'holo', 'energy', 'night'] as const
export type Backdrop = (typeof BACKDROPS)[number]

/** Elke kalenderdag (lokale tijd) de volgende uit de rij; dezelfde dag geeft altijd dezelfde. */
export function backdropForDay(date: Date): Backdrop {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return BACKDROPS[((day % BACKDROPS.length) + BACKDROPS.length) % BACKDROPS.length]
}

/** Typen in de energie-mix (Colorless valt weg: grijs tussen de kleuren). Twee rijen van vijf, de tweede verschoven. */
const MIX: readonly EnergyType[] = ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy']
const CELL = 56
/** Breedte en hoogte van één tegel van de energie-mix (px). */
export const MIX_TILE = { width: CELL * 5, height: CELL * 2 } as const

/** Alleen kleurwaarden die veilig in een SVG-attribuut passen (#rgb, #rrggbb, rgb()/hsl()/oklch()). */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([0-9.,%\s/-]+\))$/i

/**
 * Tegel met alle energiesymbolen in hun eigen kleur, als CSS-url (data-URI).
 * `colorOf` geeft de kleur per type (uit de tokens --energy-*); onbruikbare kleur = symbool weglaten.
 */
export function energyMixTile(colorOf: (type: EnergyType) => string): string {
  const scale = CELL / 36 // zelfde marge als het enkele symbool (viewBox -6 -6 36 36)
  const glyphs = MIX.map((type, i) => {
    const color = colorOf(type).trim()
    if (!SAFE_COLOR.test(color)) return ''
    const row = Math.floor(i / 5)
    const x = (i % 5) * CELL + (row === 1 ? CELL / 2 : 0) + 6 * scale
    const y = row * CELL + 6 * scale
    return `<path transform='translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})' fill='${color}' fill-rule='evenodd' d='${ENERGY_GLYPHS[type]}'/>`
  }).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${MIX_TILE.width}' height='${MIX_TILE.height}' viewBox='0 0 ${MIX_TILE.width} ${MIX_TILE.height}' overflow='hidden'>${glyphs}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
