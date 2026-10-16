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
