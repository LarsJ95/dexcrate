import type { EnergyType } from './cardTraits'

/** Zelf getekende energiesymbolen (eenvoudige vlakvormen, viewBox 0 0 24 24; DESIGN.md §7). */
export const ENERGY_GLYPHS: Record<EnergyType, string> = {
  Grass: 'M20 4C10 4 4 9 4 16c0 2 1 4 1 4s2-5 7-8c-3 3-5 6-5 8 9 0 13-7 13-16z',
  Fire: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-8z',
  Water: 'M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z',
  Lightning: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  Psychic: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  Fighting: 'M12 2l2.2 5.3 5.6-1.5-3 4.9 4.7 3.3-5.7.6.3 5.8L12 16.6l-4.1 3.8.3-5.8-5.7-.6 4.7-3.3-3-4.9 5.6 1.5z',
  Darkness: 'M15 3a9 9 0 1 0 6 15.5A8 8 0 0 1 15 3z',
  Metal: 'M12 2l8.7 5v10L12 22l-8.7-5V7zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  Dragon: 'M4 4c4 1 7 4 8 10 1-6 4-9 8-10-1 7-4 13-8 16C8 17 5 11 4 4z',
  Fairy: 'M12 2c1 5 3 8 10 10-7 2-9 5-10 10-1-5-3-8-10-10 7-2 9-5 10-10z',
  Colorless: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
}

/** CSS-kleur van een energietype (token uit index.css). */
export function energyColor(type: EnergyType): string {
  return `var(--energy-${type.toLowerCase()})`
}

/** Symbool als CSS-masker voor het achtergrondpatroon (`--glyph`). */
export function glyphMask(type: EnergyType): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-6 -6 36 36'><path fill-rule='evenodd' d='${ENERGY_GLYPHS[type]}'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * Zet de typekleur en het patroon van de hele app op dit type (achtergrondgloed, DESIGN.md §4).
 * Geeft een functie terug die de standaard (Lightning) herstelt.
 */
export function applyPageType(type: EnergyType): () => void {
  const root = document.documentElement.style
  root.setProperty('--type', energyColor(type))
  root.setProperty('--glyph', glyphMask(type))
  return () => {
    root.removeProperty('--type')
    root.removeProperty('--glyph')
  }
}
