import { useEffect, useMemo, useState, type JSX } from 'react'
import { marketValue, marketValueOf, type PriceMap } from '../lib/prices'
import { formatEur } from '../lib/stats'
import { getCardPrice, getSet, getSetList, setOfKey, type Lang } from '../lib/tcgdex'
import { hpLevel } from '../lib/trainer'
import { thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { SetIcon } from './SetIcon'

const SHOWN_SETS = 3
/** Afmaakkosten alleen automatisch berekenen bij weinig ontbrekende kaarten (elk een prijsverzoek). */
const COST_LIMIT = 30

interface NearSet {
  lang: Lang
  setId: string
  name: string
  logo: string | null
  owned: number
  total: number
}

type Cost = { amount: number; unknown: number } | 'too-many' | 'loading' | 'error'

/** Afmaakkosten van één set: marktprijs van de ontbrekende kaarten (indicatief). */
function useCompletionCost(set: NearSet, ownedIds: ReadonlySet<string>): Cost {
  const [state, setState] = useState<{ key: string; cost: Cost } | null>(null)
  const key = `${set.lang}/${set.setId}|${[...ownedIds].sort().join(',')}`
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await getSet(set.lang, set.setId)
      const missing = (data?.cards ?? []).filter((c) => !ownedIds.has(c.id))
      if (missing.length > COST_LIMIT) return 'too-many' as const
      // Tegelijk (de TCGdex-wachtrij begrenst het aantal verzoeken), niet meer één voor één (24-10-2026).
      const prices = await Promise.all(missing.map((c) => getCardPrice(`${set.lang}/${c.id}`)))
      let amount = 0
      let unknown = 0
      for (const p of prices) {
        const v = marketValue(p, null)?.value
        if (v === undefined) unknown += 1
        else amount += v
      }
      return { amount, unknown }
    })()
      .then((cost) => {
        if (!cancelled) setState({ key, cost })
      })
      .catch((err: unknown) => {
        console.warn('Afmaakkosten berekenen mislukt', err)
        if (!cancelled) setState({ key, cost: 'error' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` bevat de set en je kaarten
  }, [key])
  return state?.key === key ? state.cost : 'loading'
}

function NearSetRow({ set, ownedIds }: { set: NearSet; ownedIds: ReadonlySet<string> }): JSX.Element {
  const cost = useCompletionCost(set, ownedIds)
  const ratio = set.total ? Math.min(1, set.owned / set.total) : 0
  const missing = Math.max(0, set.total - set.owned)
  return (
    <li>
      <a className="near-set" href={`#/sets/${set.lang}/${encodeURIComponent(set.setId)}`}>
        <SetIcon key={`${set.lang}/${set.setId}`} kind="symbol" lang={set.lang} setId={set.setId} name={set.name} logo={set.logo} />
        <span className="near-set-info">
          <span className="near-set-name">{set.name}</span>
          <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={set.total} aria-valuenow={set.owned} aria-label={`${set.name}: ${set.owned} of ${set.total}`}>
            <span className="meter-fill" data-hp={hpLevel(ratio)} style={{ width: `${ratio * 100}%` }} />
          </span>
          <span className="muted small">
            {set.owned}/{set.total}, {missing} missing
            {cost === 'loading' && ', calculating cost…'}
            {typeof cost === 'object' && `, ${formatEur(cost.amount)} to complete${cost.unknown > 0 ? ` (${cost.unknown} without price)` : ''}`}
            {cost === 'too-many' && ', see the set for the cost'}
          </span>
        </span>
      </a>
    </li>
  )
}

/** De sets die het dichtst bij compleet zijn, met wat afmaken (ongeveer) kost. */
export function SetsNearlyComplete({ ownedKeys }: { ownedKeys: readonly string[] }): JSX.Element | null {
  // Taal/set → kaart-id's die je hebt.
  const bySet = useMemo(() => {
    const map = new Map<string, { lang: Lang; setId: string; ids: Set<string> }>()
    for (const k of ownedKeys) {
      const s = setOfKey(k)
      if (!s) continue
      const key = `${s.lang}/${s.setId}`
      const entry = map.get(key) ?? { lang: s.lang, setId: s.setId, ids: new Set<string>() }
      entry.ids.add(s.cardId)
      map.set(key, entry)
    }
    return map
  }, [ownedKeys])
  const langs = useMemo(() => [...new Set([...bySet.values()].map((v) => v.lang))].sort(), [bySet])
  const [near, setNear] = useState<NearSet[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(langs.map(async (l) => [l, await getSetList(l)] as const))
      .then((lists) => {
        if (cancelled) return
        const summaries = new Map(lists)
        const out: NearSet[] = []
        for (const { lang, setId, ids } of bySet.values()) {
          const s = summaries.get(lang)?.get(setId)
          if (!s?.total || ids.size >= s.total) continue
          out.push({ lang, setId, name: s.name, logo: s.logo, owned: ids.size, total: s.total })
        }
        out.sort((a, b) => b.owned / b.total - a.owned / a.total || a.total - a.owned - (b.total - b.owned))
        setNear(out.slice(0, SHOWN_SETS))
      })
      .catch((err: unknown) => {
        console.warn('Setlijst ophalen mislukt', err)
        if (!cancelled) setNear([])
      })
    return () => {
      cancelled = true
    }
  }, [bySet, langs])

  if (!near || near.length === 0) return null
  return (
    <section className="panel near-sets" aria-labelledby="near-sets-title">
      <h2 id="near-sets-title" className="panel-title">
        Almost there!
      </h2>
      <ul>
        {near.map((s) => (
          <NearSetRow key={`${s.lang}/${s.setId}`} set={s} ownedIds={bySet.get(`${s.lang}/${s.setId}`)?.ids ?? new Set()} />
        ))}
      </ul>
    </section>
  )
}

const RECENT = 8

/** Je laatst toegevoegde kaarten met foto en huidige waarde. */
export function RecentlyAdded({ cards, prices, onOpenCard }: { cards: readonly Card[]; prices: PriceMap; onOpenCard?: (id: string) => void }): JSX.Element | null {
  const recent = useMemo(
    () =>
      cards
        .filter((c) => c.ownership === 'owned')
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.sort_order - a.sort_order)
        .slice(0, RECENT),
    [cards],
  )
  if (recent.length === 0) return null
  return (
    <section className="panel recent-cards" aria-labelledby="recent-title">
      <h2 id="recent-title" className="panel-title">
        Fresh pulls
      </h2>
      <ul>
        {recent.map((c) => {
          const mv = marketValueOf(c, prices)
          return (
            <li key={c.id}>
              <button type="button" className="recent-card" onClick={() => onOpenCard?.(c.id)} disabled={!onOpenCard}>
                <span className="recent-thumb">
                  <CardImage tcgdexId={c.tcgdex_id} kind={c.kind} name={c.name} photoPath={thumbPath(c)} detail={[c.set_code, c.card_number && `#${c.card_number}`].filter(Boolean).join(' ')} />
                </span>
                <span className="recent-name">{c.name}</span>
                <span className="muted small">{mv ? formatEur(mv.value) : '–'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
