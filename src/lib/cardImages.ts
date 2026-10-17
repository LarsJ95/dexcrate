import { setOfKey, type Lang } from './tcgdex'

/**
 * Extra bronnen voor Engelse kaartfoto's die TCGdex niet heeft (promo's, gallery's, energie, sommige sets).
 * Gemeten 16-10-2026: samen ±1.000 van de ±1.600 Engelse kaarten zonder TCGdex-foto.
 */

const LIMITLESS = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci'

/**
 * TCGdex-sets waarvan de nummering bij Limitless/pokemontcg.io anders is (gecontroleerd op kaartnaam, 16-10-2026):
 * daar zou een verkeerde kaart verschijnen, dus geen plaatje uit die bronnen.
 */
const NUMBERING_DIFFERS = new Set(['30th-c'])

/** Limitless TCG: "<AFK>/<AFK>_<nr>_R_EN_SM.png"; nummers met 3 cijfers. */
export function limitlessEnCardUrl(abbr: string | null | undefined, setId: string, localId: string, quality: 'low' | 'high'): string | null {
  if (NUMBERING_DIFFERS.has(setId) || !abbr || !/^[A-Za-z0-9]+$/.test(abbr) || !/^[A-Za-z0-9]+$/.test(localId)) return null
  const code = abbr.toUpperCase()
  const num = /^\d+$/.test(localId) ? localId.padStart(3, '0') : localId
  return `${LIMITLESS}/${code}/${code}_${num}_R_EN_${quality === 'high' ? 'LG' : 'SM'}.png`
}

/** pokemontcg.io: "<set-id>/<nr>.png" (groot: "_hires"); nummers zonder voorloopnullen. */
export function ptcgCardUrl(ptcgSetId: string | null | undefined, setId: string, localId: string, quality: 'low' | 'high'): string | null {
  if (NUMBERING_DIFFERS.has(setId) || !ptcgSetId || !/^[a-z0-9]+$/i.test(ptcgSetId) || !/^[A-Za-z0-9]+$/.test(localId)) return null
  const num = /^\d+$/.test(localId) ? String(Number.parseInt(localId, 10)) : localId
  return `https://images.pokemontcg.io/${ptcgSetId}/${num}${quality === 'high' ? '_hires' : ''}.png`
}

// --- Plaatjes-URL's uit TCGdex, Limitless (Aziatisch) en TCGplayer ---

export function imageUrl(base: string | null, quality: 'low' | 'high'): string | null {
  return base ? `${base}/${quality}.webp` : null
}

/**
 * Japanse kaartfoto van Limitless TCG ("SV8_107_R_JP_SM.png", nummer zonder voorloopnullen).
 * Koreaanse en Traditioneel Chinese sets delen meestal setcode + nummer met de Japanse uitgave.
 */
export function limitlessJpUrl(setId: string, localId: string, quality: 'low' | 'high'): string | null {
  if (!/^\d+$/.test(localId) || !/^[A-Za-z0-9-]+$/.test(setId)) return null
  const n = String(Number.parseInt(localId, 10))
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${setId}/${setId}_${n}_R_JP_${quality === 'high' ? 'LG' : 'SM'}.png`
}

/** Productfoto van TCGplayer op basis van het productnummer. */
export function tcgplayerImageUrl(productId: number | null | undefined, quality: 'low' | 'high'): string | null {
  if (!productId || !Number.isInteger(productId) || productId <= 0) return null
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${quality === 'high' ? '400w' : '200w'}.jpg`
}

/** Mogelijke plaatjes-URL's in volgorde van voorkeur (TCGdex → Limitless voor Aziatische talen → TCGplayer); de weergave probeert de volgende als er een faalt. */
export function imageCandidates(
  lang: Lang,
  setId: string,
  localId: string,
  base: string | null,
  quality: 'low' | 'high',
  tcgplayerId?: number | null,
): string[] {
  const out: string[] = []
  const tcgdex = imageUrl(base, quality)
  if (tcgdex) out.push(tcgdex)
  if (lang === 'ja' || lang === 'zh-tw' || lang === 'ko') {
    const jp = limitlessJpUrl(setId, localId, quality)
    if (jp) out.push(jp)
  }
  const tcgplayer = tcgplayerImageUrl(tcgplayerId, quality)
  if (tcgplayer) out.push(tcgplayer)
  return out
}

/** Plaatjes voor een kaart-sleutel ("ja/SV8-107") zonder eerst de kaartdetails op te halen. */
export function imageCandidatesForKey(key: string, base: string | null, quality: 'low' | 'high'): string[] {
  const s = setOfKey(key)
  if (!s) return base ? [imageUrl(base, quality) as string] : []
  const localId = s.cardId.slice(s.setId.length + 1)
  return imageCandidates(s.lang, s.setId, localId, base, quality)
}
