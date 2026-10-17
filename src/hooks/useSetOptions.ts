import { useEffect, useMemo, useState } from 'react'
import { setKeyOf } from '../lib/collectionFilters'
import { matchesFilter, type StatusFilter } from '../lib/collectionView'
import { getSetList, isLang } from '../lib/tcgdex'
import type { Card } from '../lib/types'

export interface SetOption {
  key: string
  label: string
}

/** Sets waar je (binnen de gekozen status) kaarten van hebt, met naam en afkorting: "151 (MEW)". */
export function useSetOptions(cards: readonly Card[] | null, filter: StatusFilter): SetOption[] {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  // Afkorting uit de kaarten zelf (setcode bij toevoegen), zodat er niets extra opgehaald hoeft te worden.
  const groups = useMemo(() => {
    const out = new Map<string, string | null>()
    for (const c of cards ?? []) {
      if (!matchesFilter(c, filter)) continue
      const key = setKeyOf(c)
      if (key && !out.get(key)) out.set(key, c.set_code?.trim().toUpperCase() || null)
    }
    return out
  }, [cards, filter])
  const langs = useMemo(() => [...new Set([...groups.keys()].map((k) => k.split('/')[0]).filter(isLang))].sort(), [groups])

  useEffect(() => {
    let cancelled = false
    Promise.all(langs.map(async (l) => [l, await getSetList(l)] as const))
      .then((lists) => {
        if (cancelled) return
        const map = new Map<string, string>()
        for (const [l, list] of lists) for (const [id, s] of list) map.set(`${l}/${id}`, s.name)
        setNames(map)
      })
      .catch((err: unknown) => console.warn('Setnamen ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [langs])

  return useMemo(() => {
    const out: SetOption[] = []
    for (const [key, code] of groups) {
      const lang = key.split('/')[0]
      const name = key.startsWith('code:') ? null : (names.get(key) ?? key.slice(key.indexOf('/') + 1))
      const label = name ? `${name}${code && code !== name.toUpperCase() ? ` (${code})` : ''}${lang !== 'en' ? `, ${lang}` : ''}` : key.slice(5)
      out.push({ key, label })
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
  }, [groups, names])
}
