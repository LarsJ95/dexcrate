/**
 * Privacy en voorwaarden (24-10-2026): losse pagina's op de site naast de app (landing/privacy.html, terms.html).
 * De app staat in /app/, dus één map omhoog; zo werkt het ook op een ander adres (bv. GitHub Pages).
 */
export const PRIVACY_URL = '../privacy.html'
export const TERMS_URL = '../terms.html'

/** Waar de gegevens in de app vandaan komen (Settings → About). */
export const SOURCES: readonly { name: string; what: string; url: string }[] = [
  { name: 'TCGdex', what: 'card data and Cardmarket prices', url: 'https://tcgdex.dev' },
  { name: 'Cardmarket', what: 'market prices (via TCGdex)', url: 'https://www.cardmarket.com' },
  { name: 'Limitless TCG, pokemontcg.io, TCGplayer', what: 'extra card images', url: 'https://limitlesstcg.com' },
  { name: 'PriceCharting', what: 'card images that are missing elsewhere', url: 'https://www.pricecharting.com' },
  { name: 'PokéAPI', what: 'Pokémon names, sprites and artwork', url: 'https://pokeapi.co' },
  { name: 'PTCG-CHS-Datasets', what: 'Simplified Chinese card data (non-commercial)', url: 'https://github.com/duanxr/PTCG-CHS-Datasets' },
]
