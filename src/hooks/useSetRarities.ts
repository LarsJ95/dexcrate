import { useEffect, useState } from 'react'
import { getSetRarities, isLang } from '../lib/tcgdex'

/**
 * Zeldzaamheid per kaart-id van een hele set (alleen als `enabled`). undefined = laden;
 * null = niet beschikbaar (andere taal dan Engels, of ophalen mislukt): dan per kaart ophalen.
 */
export function useSetRarities(lang: string, setId: string | null, enabled: boolean): ReadonlyMap<string, string | null> | null | undefined {
  const [result, setResult] = useState<{ key: string; value: ReadonlyMap<string, string | null> | null } | null>(null)
  const key = `${lang}/${setId ?? ''}`

  useEffect(() => {
    if (!enabled || !setId || !isLang(lang)) return
    let cancelled = false
    getSetRarities(lang, setId)
      .then((value) => {
        if (!cancelled) setResult({ key, value })
      })
      .catch((err: unknown) => {
        console.warn('Zeldzaamheden van de set ophalen mislukt; per kaart', err)
        if (!cancelled) setResult({ key, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, lang, setId, key])

  if (!enabled || !setId || !isLang(lang)) return null
  return result?.key === key ? result.value : undefined
}
