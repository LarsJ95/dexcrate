import { useEffect, useState } from 'react'
import { getSetVariants, isLang } from '../lib/tcgdex'
import type { Variant } from '../lib/types'

/**
 * Uitvoeringen per kaart-id van een hele set in een paar verzoeken (voor de master set). undefined = laden;
 * null = niet beschikbaar (andere taal dan Engels, of ophalen mislukt): dan per kaart (useSetVariants).
 */
export function useSetVariantMap(lang: string, setId: string | null): ReadonlyMap<string, Variant[] | null> | null | undefined {
  const [result, setResult] = useState<{ key: string; value: ReadonlyMap<string, Variant[] | null> | null } | null>(null)
  const key = `${lang}/${setId ?? ''}`

  useEffect(() => {
    if (!setId || !isLang(lang)) return
    let cancelled = false
    getSetVariants(lang, setId)
      .then((value) => {
        if (!cancelled) setResult({ key, value })
      })
      .catch((err: unknown) => {
        console.warn('Uitvoeringen van de set ophalen mislukt; per kaart', err)
        if (!cancelled) setResult({ key, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [lang, setId, key])

  if (!setId || !isLang(lang)) return null
  return result?.key === key ? result.value : undefined
}
