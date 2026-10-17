import { useEffect, useRef, useState } from 'react'
import { getCardInfo, isLang, type SetCard } from '../lib/tcgdex'
import type { Variant } from '../lib/types'

/**
 * Uitvoeringen per kaart (TCGdex, gecachet), alleen nodig bij een verzameldoel per uitvoering.
 * Wordt in blokjes van 10 bijgewerkt; `loading` is null als alles binnen is.
 */
export function useSetVariants(
  lang: string,
  cards: readonly SetCard[] | null,
  enabled: boolean,
): { variantsByCard: ReadonlyMap<string, Variant[] | null>; loading: { done: number; total: number } | null } {
  const [variantsByCard, setVariantsByCard] = useState<ReadonlyMap<string, Variant[] | null>>(new Map())
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null)
  const variantsRef = useRef<ReadonlyMap<string, Variant[] | null>>(variantsByCard)

  useEffect(() => {
    if (!enabled || !cards || !isLang(lang)) return
    let cancelled = false
    const found = new Map(variantsRef.current)
    const todo = cards.filter((c) => !found.has(c.id))
    if (todo.length === 0) return
    let done = 0
    const publish = (): void => {
      variantsRef.current = new Map(found)
      setVariantsByCard(variantsRef.current)
      setLoading(done < todo.length ? { done, total: todo.length } : null)
    }
    void Promise.all(
      todo.map(async (c) => {
        let v: Variant[] | null = null
        try {
          v = (await getCardInfo(`${lang}/${c.id}`))?.variants ?? null
        } catch (err) {
          console.warn(`Uitvoeringen ophalen mislukt voor ${c.id}`, err)
        }
        if (cancelled) return
        found.set(c.id, v)
        done += 1
        if (done % 10 === 0 || done === todo.length) publish()
      }),
    )
    return () => {
      cancelled = true
    }
  }, [enabled, cards, lang])

  return { variantsByCard, loading }
}
