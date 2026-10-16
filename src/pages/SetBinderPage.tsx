import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import { listCards } from '../lib/db'
import { ENERGY_TYPES, rarityRule } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import { burstFrom } from '../lib/fx'
import { SET_MILESTONES, celebrateMilestone, showMoment } from '../lib/moments'
import { useMotion } from '../lib/motion'
import { hpLevel } from '../lib/trainer'
import { spriteUrls } from '../lib/runner'
import { DEFAULT_GOAL, goalProgress, goalRequirements, type GoalSettings, type OwnedCopy, type RequirementState } from '../lib/goals'
import { marketValue } from '../lib/prices'
import { SET_SORT_LABELS, sortSetCards, type SetSort } from '../lib/setSort'
import { formatEur } from '../lib/stats'
import { VARIANT_LABELS, type Variant } from '../lib/types'
import { loadGoal } from '../lib/wishlist'
import { CardFace } from '../components/CardFace'
import { CatalogCardPicture } from '../components/CatalogCardPicture'
import { GoalSheet } from '../components/GoalSheet'
import { IconArrowLeft } from '../components/Icons'
import { SetCardSheet } from '../components/SetCardSheet'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { getCardInfo, getCardPrice, getSet, isLang, setOfKey, type SetCard, type SetSummary } from '../lib/tcgdex'
import { Loading } from '../components/Loading'

interface Props {
  /** "<taal>/<set-id>" uit de URL. */
  param: string
}

type Show = 'all' | 'owned' | 'missing'
type PageSize = 9 | 12

interface Loaded {
  summary: SetSummary
  cards: SetCard[]
  /** kaart-id → aantal in bezit (elke uitvoering, incl. onderweg) */
  owned: Map<string, number>
  /** Eigen exemplaren in deze set, voor het verzameldoel. */
  copies: OwnedCopy[]
}

interface Cost {
  done: number
  total: number
  /** "<kaart-id>|<uitvoering>" → marktprijs per stuk (null = onbekend) */
  prices: Map<string, number | null>
  running: boolean
}

/** Korte aanduiding van een uitvoering in een binder-vak. */
const VARIANT_SHORT: Record<Variant, string> = { normal: 'N', holo: 'H', reverse: 'R', firstEdition: '1st' }

const formatValue = (v: number | null): string => (v === null ? 'no price' : formatEur(v))

const stateKey = (s: RequirementState): string => `${s.req.cardId}|${s.req.variant ?? 'any'}`

const PAGE_SIZE_KEY = 'dexcrate:binder-page-size'
/** Kaarten in bezit bij het vorige bezoek, om nieuwe in hun vak te laten springen. */
const SEEN_KEY = 'dexcrate:binder-seen:'
/** Set al gevierd als compleet; weer weg als de set niet meer compleet is. */
const COMPLETE_KEY = 'dexcrate:set-complete:'
/** Hoogste gevierde mijlpaal per set. */
const MILESTONE_KEY = 'dexcrate:set-milestone:'
const MAX_NEW = 12
const SPARKLE_COLORS = ENERGY_TYPES.filter((t) => t !== 'Colorless').map(energyColor)

function readSeen(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null // geen opslag of kapotte waarde: als eerste bezoek behandelen
  }
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch (err) {
    console.warn('Binderstatus onthouden mislukt', err)
  }
}
const OLD_PAGE_SIZE_KEY = 'binderline:binder-page-size'

function readPageSize(): PageSize {
  try {
    return (localStorage.getItem(PAGE_SIZE_KEY) ?? localStorage.getItem(OLD_PAGE_SIZE_KEY)) === '12' ? 12 : 9
  } catch {
    return 9 // geen opslag: standaard 9-pocket
  }
}

export function SetBinderPage({ param }: Props): JSX.Element {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('all')
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize)
  const [cost, setCost] = useState<Cost | null>(null)
  const [openCard, setOpenCard] = useState<SetCard | null>(null)
  const [sort, setSort] = useState<SetSort>('number')
  // Marktwaarde per kaart-id, alleen geladen bij sorteren op waarde.
  const [values, setValues] = useState<{ prices: ReadonlyMap<string, number | null>; done: number; total: number } | null>(null)
  const cancelCost = useRef(false)
  // Verzameldoel (STAP6): wat telt mee voor "compleet".
  const goalsEnabled = useWishlistEnabled() === true
  const [goal, setGoal] = useState<GoalSettings>(DEFAULT_GOAL)
  const [goalOpen, setGoalOpen] = useState(false)
  // Uitvoeringen per kaart (TCGdex), alleen nodig bij een doel per uitvoering.
  const [variantsByCard, setVariantsByCard] = useState<ReadonlyMap<string, Variant[] | null>>(new Map())
  const [variantsLoading, setVariantsLoading] = useState<{ done: number; total: number } | null>(null)
  const variantsRef = useRef<ReadonlyMap<string, Variant[] | null>>(variantsByCard)

  const slash = param.indexOf('/')
  const lang = param.slice(0, slash)
  const setId = decodeURIComponent(param.slice(slash + 1))
  const valid = slash > 0 && isLang(lang) && setId.length > 0

  useEffect(() => {
    if (!valid || !isLang(lang)) return
    let cancelled = false
    // Binder blijft bekijkbaar als je collectie (even) niet laadt; dan staat alles als "missing".
    const myCards = listCards().catch((err: unknown) => {
      console.warn('Collectie laden mislukt', err)
      return []
    })
    Promise.all([getSet(lang, setId), myCards])
      .then(([set, cards]) => {
        if (cancelled) return
        if (!set) {
          setError('This set was not found.')
          return
        }
        const owned = new Map<string, number>()
        const copies: OwnedCopy[] = []
        for (const c of cards) {
          if (c.status === 'sold' || !c.tcgdex_id) continue
          const s = setOfKey(c.tcgdex_id)
          if (!s || s.lang !== lang || s.setId !== set.summary.id) continue
          owned.set(s.cardId, (owned.get(s.cardId) ?? 0) + c.quantity)
          copies.push({ cardId: s.cardId, variant: c.variant, language: c.language, quantity: c.quantity, incoming: c.ownership === 'incoming' })
        }
        setData({ summary: set.summary, cards: set.cards, owned, copies })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading failed.')
      })
    return () => {
      cancelled = true
    }
  }, [valid, lang, setId])

  // Opgeslagen doel voor deze set.
  useEffect(() => {
    if (!goalsEnabled || !valid || !isLang(lang)) return
    let cancelled = false
    loadGoal(lang, setId)
      .then((g) => {
        if (!cancelled) setGoal(g)
      })
      .catch((err: unknown) => console.warn('Doel laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [goalsEnabled, valid, lang, setId])

  // Doel per uitvoering: uitvoeringen van elke kaart ophalen (gecachet), in blokjes bijwerken.
  const needVariants = goal.variants.length > 0
  useEffect(() => {
    if (!needVariants || !data || !isLang(lang)) return
    let cancelled = false
    const found = new Map(variantsRef.current)
    const todo = data.cards.filter((c) => !found.has(c.id))
    if (todo.length === 0) return
    let done = 0
    const publish = (): void => {
      variantsRef.current = new Map(found)
      setVariantsByCard(variantsRef.current)
      setVariantsLoading(done < todo.length ? { done, total: todo.length } : null)
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
  }, [needVariants, data, lang])

  /** Sorteren op waarde: marktprijs (standaarduitvoering) van elke kaart laden; prijzen worden 6 uur gecachet. */
  function loadValues(): void {
    if (!data || !isLang(lang) || values) return
    cancelCost.current = false
    const prices = new Map<string, number | null>()
    let done = 0
    const total = data.cards.length
    setValues({ prices, done, total })
    for (const c of data.cards) {
      getCardPrice(`${lang}/${c.id}`)
        .then((p) => prices.set(c.id, marketValue(p, null)?.value ?? null))
        .catch((err: unknown) => {
          console.warn(`Prijs ophalen mislukt voor ${c.id}`, err)
          prices.set(c.id, null)
        })
        .finally(() => {
          done += 1
          if (!cancelCost.current && (done % 10 === 0 || done === total)) setValues({ prices: new Map(prices), done, total })
        })
    }
  }

  function changeSort(next: SetSort): void {
    setSort(next)
    if (next === 'value') loadValues()
  }

  // Sorteren op zeldzaamheid: kaartinfo (7 dagen gecachet).
  const cardKeys = useMemo(() => (data && isLang(lang) ? data.cards.map((c) => `${lang}/${c.id}`) : []), [data, lang])
  const infos = useCatalogInfos(cardKeys, sort === 'rarity')
  // Who's that Pokémon? Silhouet van ontbrekende Pokémon-kaarten (Pokédex-nummer uit de kaartinfo).
  const motion = useMotion()
  const silhouetteInfos = useCatalogInfos(cardKeys, motion)
  const ranks = useMemo(() => {
    const map = new Map<string, number>()
    for (const [key, info] of infos) if (info) map.set(key.slice(key.indexOf('/') + 1), rarityRule(info.rarity).rank)
    return map
  }, [infos])

  // Lopende kostenberekening stoppen bij verlaten van de pagina.
  useEffect(
    () => () => {
      cancelCost.current = true
    },
    [],
  )

  const progress = useMemo(() => {
    if (!data) return null
    const reqs = goalRequirements(data.cards, variantsByCard, goal, data.summary.official ?? null)
    return goalProgress(reqs, data.copies, goal)
  }, [data, variantsByCard, goal])

  /** Vakjes per kaart; een kaart zonder vakjes valt buiten het doel (bv. secret rare uitgezet). */
  const statesByCard = useMemo(() => {
    const map = new Map<string, RequirementState[]>()
    for (const st of progress?.states ?? []) map.set(st.req.cardId, [...(map.get(st.req.cardId) ?? []), st])
    return map
  }, [progress])

  function changePageSize(size: PageSize): void {
    setPageSize(size)
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size))
    } catch (err) {
      console.warn('Paginaformaat onthouden mislukt', err)
    }
  }

  /** Kosten om het doel af te maken: per ontbrekend vakje de marktprijs van precies die uitvoering × ontbrekend aantal. */
  async function calculateCost(): Promise<void> {
    if (!progress || !isLang(lang) || cost?.running) return
    const missing = progress.states.filter((st) => st.missing > 0)
    cancelCost.current = false
    const prices = new Map<string, number | null>()
    setCost({ done: 0, total: missing.length, prices, running: true })
    let done = 0
    // Prijzen komen via de centrale TCGdex-wachtrij (max. 6 tegelijk) en worden 6 uur gecachet.
    await Promise.all(
      missing.map(async (st) => {
        let value: number | null = null
        try {
          value = marketValue(await getCardPrice(`${lang}/${st.req.cardId}`), st.req.variant)?.value ?? null
        } catch (err) {
          console.error(`Prijs ophalen mislukt voor ${st.req.cardId}`, err)
        }
        if (cancelCost.current) return
        prices.set(stateKey(st), value)
        done += 1
        if (done % 5 === 0 || done === missing.length) setCost({ done, total: missing.length, prices: new Map(prices), running: done < missing.length })
      }),
    )
  }

  const visible = useMemo(() => {
    if (!data) return []
    const complete = (id: string): boolean => {
      const states = statesByCard.get(id)
      return Boolean(states && states.length > 0 && states.every((st) => st.missing === 0))
    }
    const shown =
      show === 'owned'
        ? data.cards.filter((c) => complete(c.id))
        : show === 'missing'
          ? data.cards.filter((c) => statesByCard.has(c.id) && !complete(c.id))
          : data.cards
    return sortSetCards(shown, sort, { complete, value: values?.prices ?? new Map(), rank: ranks })
  }, [data, show, statesByCard, sort, values, ranks])

  // Binderpagina's alleen in setvolgorde; gesorteerd is het één doorlopend raster.
  const pages = useMemo(() => {
    if (sort !== 'number') return [visible]
    const out: SetCard[][] = []
    for (let i = 0; i < visible.length; i += pageSize) out.push(visible.slice(i, i + pageSize))
    return out
  }, [visible, pageSize, sort])

  // Nieuw sinds het vorige bezoek (eerste bezoek: niets); daarna onthouden wat je nu hebt.
  const newIds = useMemo<ReadonlySet<string>>(() => {
    if (!data) return new Set()
    const owned = [...data.owned].filter(([, qty]) => qty > 0).map(([id]) => id)
    const seen = readSeen(`${SEEN_KEY}${lang}/${setId}`)
    return new Set(seen ? owned.filter((id) => !seen.has(id)).slice(0, MAX_NEW) : [])
  }, [data, lang, setId])

  useEffect(() => {
    if (!data) return
    const owned = [...data.owned].filter(([, qty]) => qty > 0).map(([id]) => id)
    remember(`${SEEN_KEY}${lang}/${setId}`, JSON.stringify(owned))
    if (newIds.size === 0) return
    // Glinster zodra de nieuwe kaarten in hun vak landen.
    const timer = window.setTimeout(() => {
      document.querySelectorAll('.slot.is-new .slot-open').forEach((el, i) => {
        window.setTimeout(() => burstFrom(el, { colors: SPARKLE_COLORS, count: 14, speed: 4, gravity: 0.06 }), i * 120)
      })
    }, 450)
    return () => clearTimeout(timer)
  }, [data, newIds, lang, setId])

  const isComplete = progress !== null && progress.total > 0 && progress.done >= progress.total

  // Set compleet: één keer vieren; niet meer compleet, dan mag het later opnieuw.
  useEffect(() => {
    if (!data || !progress) return
    const key = `${COMPLETE_KEY}${lang}/${setId}`
    if (!isComplete) {
      remember(key, null)
      return
    }
    try {
      if (localStorage.getItem(key)) return
    } catch {
      return // geen opslag: niet bij elk bezoek opnieuw vieren
    }
    remember(key, '1')
    showMoment({ kind: 'complete', setName: data.summary.name })
  }, [data, progress, isComplete, lang, setId])

  // Mijlpaal (10, 25, 50 … kaarten in deze set); compleet heeft zijn eigen viering.
  useEffect(() => {
    if (!data || !progress || isComplete) return
    const setName = data.summary.name
    celebrateMilestone(`${MILESTONE_KEY}${lang}/${setId}`, progress.cardsOwned, SET_MILESTONES, (n) => `${n} cards in ${setName}`)
  }, [data, progress, isComplete, lang, setId])

  const costSummary = useMemo(() => {
    if (!cost || !progress) return null
    let cents = 0
    let unknown = 0
    for (const st of progress.states) {
      if (st.missing === 0) continue
      const v = cost.prices.get(stateKey(st))
      if (v === undefined) continue
      if (v === null) unknown += st.missing
      else cents += st.missing * Math.round(v * 100)
    }
    return { amount: cents / 100, unknown }
  }, [cost, progress])

  if (!valid) return <p className="page error">Invalid set. <a href="#/sets">Back to sets</a></p>
  if (error) return <p className="page error" role="alert">{error} <a href="#/sets">Back to sets</a></p>
  if (!data || !progress) return <Loading center />

  const total = progress.cardsTotal
  const ownedCount = progress.cardsOwned
  const missingCount = progress.total - progress.done
  const variantGoal = goal.variants.length > 0
  const unit = variantGoal ? 'versions' : 'cards'
  const goalText = [
    variantGoal ? goal.variants.map((v) => VARIANT_LABELS[v]).join(', ') : null,
    goal.languages.length > 0 ? `${goal.languages.length === 1 ? 'language' : 'languages'}: ${goal.languages.join(', ')}` : null,
    goal.wantedQty > 1 ? `${goal.wantedQty} copies each` : null,
    goal.includeSecret ? null : 'no secret rares',
    goal.includeIncoming ? 'incoming counts' : null,
  ].filter(Boolean)

  return (
    <section className="page">
      <a href="#/sets" className="back">
        <IconArrowLeft size={18} />
        All sets
      </a>
      <div className="page-head">
        <div>
          <h1>
            {data.summary.name} {isComplete && <span className="complete-badge">Complete</span>}
          </h1>
          <p className="muted">
            {ownedCount} of {total} cards
            {variantGoal && `, ${progress.done} of ${progress.total} versions`}
            {data.summary.releaseDate && `, released ${data.summary.releaseDate.slice(0, 4)}`}
          </p>
          {goalText.length > 0 && <p className="muted small">Goal: {goalText.join('; ')}</p>}
        </div>
        {goalsEnabled && isLang(lang) && (
          <button type="button" onClick={() => setGoalOpen(true)}>
            Goal settings
          </button>
        )}
      </div>

      <div
        className="set-progress"
        role="progressbar"
        aria-label={`${unit} collected`}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <span
          data-hp={hpLevel(progress.total > 0 ? progress.done / progress.total : 0)}
          style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
        />
      </div>

      {(progress.duplicates > 0 || progress.ordered > 0 || progress.unknownVariant > 0 || variantsLoading) && (
        <div className="stat-row">
          {progress.duplicates > 0 && (
            <div className="stat">
              <span className="stat-label">Duplicates</span>
              <span className="stat-value">{progress.duplicates}</span>
              <span className="stat-sub">More than you need for this goal</span>
            </div>
          )}
          {progress.ordered > 0 && (
            <div className="stat">
              <span className="stat-label">Incoming</span>
              <span className="stat-value">{progress.ordered}</span>
              <span className="stat-sub">Ordered, not counted yet</span>
            </div>
          )}
          {progress.unknownVariant > 0 && (
            <div className="stat">
              <span className="stat-label">Version unknown</span>
              <span className="stat-value">{progress.unknownVariant}</span>
              <span className="stat-sub">Set the variant on these cards to count them</span>
            </div>
          )}
          {variantsLoading && (
            <div className="stat">
              <span className="stat-label">Checking versions</span>
              <span className="stat-value">
                {variantsLoading.done} of {variantsLoading.total}
              </span>
              <span className="stat-sub">Which versions exist per card</span>
            </div>
          )}
        </div>
      )}

      {missingCount > 0 && data.cards.length > 0 && (
        <div className="panel cost-panel">
          <div>
            <span className="stat-label">Cost to complete</span>
            {costSummary && cost ? (
              <>
                <p className="meter-value">
                  {cost.running ? `${formatEur(costSummary.amount)}…` : formatEur(costSummary.amount)}
                </p>
                <p className="muted small">
                  {cost.running
                    ? `Fetching prices: ${cost.done} of ${cost.total}`
                    : `${missingCount} missing ${unit}${costSummary.unknown > 0 ? `, ${costSummary.unknown} without price (not included)` : ''}`}
                </p>
              </>
            ) : (
              <p className="muted small">
                Market price of your {missingCount} missing {unit} (indicative).
              </p>
            )}
          </div>
          {!cost?.running && (
            <button type="button" className="primary" onClick={() => void calculateCost()}>
              {cost ? 'Recalculate' : 'Calculate'}
            </button>
          )}
        </div>
      )}

      <div className="filters">
        <div className="segmented" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['owned', 'Complete'],
              ['missing', 'Missing'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={show === key} onClick={() => setShow(key)}>
              {label}
            </button>
          ))}
        </div>
        {sort === 'number' && (
          <div className="segmented" role="group" aria-label="Pockets per page">
            {([9, 12] as const).map((size) => (
              <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => changePageSize(size)}>
                {size === 9 ? '9 per page' : '12 per page'}
              </button>
            ))}
          </div>
        )}
        <select aria-label="Sort" value={sort} onChange={(e) => changeSort(e.target.value as SetSort)}>
          {(Object.keys(SET_SORT_LABELS) as SetSort[]).map((k) => (
            <option key={k} value={k}>
              {SET_SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {sort === 'value' && values && values.done < values.total && (
        <p className="muted small" aria-live="polite">
          Loading prices… {values.done} of {values.total}
        </p>
      )}
      {sort === 'rarity' && infos.size < cardKeys.length && (
        <p className="muted small" aria-live="polite">
          Loading rarities… {infos.size} of {cardKeys.length}
        </p>
      )}

      {data.cards.length === 0 && (
        <p className="notice">No card list is available for this set.</p>
      )}

      {openCard && isLang(lang) && (
        <SetCardSheet
          key={openCard.id}
          lang={lang}
          card={openCard}
          setName={data.summary.name}
          setCode={data.summary.abbr ?? data.summary.id}
          owned={data.owned.get(openCard.id) ?? 0}
          onClose={() => setOpenCard(null)}
        />
      )}

      {goalOpen && isLang(lang) && (
        <GoalSheet
          lang={lang}
          setId={data.summary.id}
          setName={data.summary.name}
          goal={goal}
          onClose={() => setGoalOpen(false)}
          onSaved={(g) => {
            setGoal(g)
            setCost(null)
            setGoalOpen(false)
          }}
        />
      )}

      {variantGoal && (
        <div className="variant-legend" aria-label="Legend">
          {goal.variants.map((v) => (
            <span key={v} className="legend-item">
              <span className="slot-variants">
                <span className="ok">{VARIANT_SHORT[v]}</span>
              </span>
              {VARIANT_LABELS[v]}
            </span>
          ))}
          <span className="legend-item">Green: owned. Dashed outline: missing.</span>
        </div>
      )}

      <div className={sort === 'number' ? 'binder-pages' : 'binder-sorted'}>
        {pages.map((page, i) => (
          <section key={i} className="binder-page" aria-label={sort === 'number' ? `Page ${i + 1}` : `Cards sorted by ${SET_SORT_LABELS[sort].toLowerCase()}`}>
            {sort === 'number' && <p className="binder-page-label">Page {i + 1}</p>}
            <ul className="binder set-binder" style={sort === 'number' ? { ['--binder-cols' as string]: pageSize === 9 ? 3 : 4 } : undefined}>
              {page.map((c) => {
                const qty = data.owned.get(c.id)
                const states = statesByCard.get(c.id) ?? []
                const inGoal = states.length > 0
                const complete = inGoal && states.every((st) => st.missing === 0)
                // Prijs van wat er van deze kaart nog ontbreekt (alleen als alle prijzen bekend zijn).
                // undefined = (nog) niet berekend, null = minstens één prijs onbekend.
                let price: number | null | undefined
                if (cost && !complete) {
                  let cents = 0
                  let fetched = true
                  let unknown = false
                  for (const st of states) {
                    if (st.missing === 0) continue
                    const v = cost.prices.get(stateKey(st))
                    if (v === undefined) fetched = false
                    else if (v === null) unknown = true
                    else cents += st.missing * Math.round(v * 100)
                  }
                  price = !fetched ? undefined : unknown ? null : cents / 100
                }
                const versioned = states.filter((st) => st.req.variant !== null)
                const dexId = motion && !complete ? (silhouetteInfos.get(`${lang}/${c.id}`)?.dexId ?? null) : null
                return (
                  <li
                    key={c.id}
                    className={`slot${complete ? ' have' : ' missing'}${inGoal ? '' : ' outside'}${newIds.has(c.id) ? ' is-new' : ''}${dexId ? ' has-silhouette' : ''}`}
                    style={newIds.has(c.id) ? ({ '--pop-delay': `${[...newIds].indexOf(c.id) * 120}ms` } as CSSProperties) : undefined}
                  >
                    <button
                      type="button"
                      className="slot-open"
                      onClick={() => setOpenCard(c)}
                      aria-label={`View ${c.name} #${c.localId}${complete ? '' : inGoal ? ' (missing)' : ' (not in goal)'}`}
                    >
                      {isLang(lang) ? (
                        <CatalogCardPicture
                          lang={lang}
                          setId={data.summary.id}
                          localId={c.localId}
                          image={c.image}
                          name={c.name}
                          quality="low"
                          alt={`${c.name} ${c.localId}`}
                          fallback={<CardFace name={c.name} detail={`#${c.localId}`} />}
                        />
                      ) : (
                        <CardFace name={c.name} detail={`#${c.localId}`} />
                      )}
                      {dexId && (
                        <span className="whos-that" aria-hidden="true">
                          <img className="whos-that-dark" src={spriteUrls(dexId, false)[1]} alt="" loading="lazy" />
                          <img className="whos-that-color" src={spriteUrls(dexId, false)[1]} alt="" loading="lazy" />
                        </span>
                      )}
                      <span className="slot-name" title={c.name}>
                        {c.name}
                      </span>
                      <span className="slot-num">#{c.localId}</span>
                      {versioned.length > 0 && (
                        <span className="slot-variants">
                          {versioned.map((st) => (
                            <span
                              key={st.req.variant}
                              className={st.missing === 0 ? 'ok' : 'miss'}
                              title={`${VARIANT_LABELS[st.req.variant as Variant]}: ${st.missing === 0 ? 'owned' : 'missing'}`}
                            >
                              {VARIANT_SHORT[st.req.variant as Variant]}
                            </span>
                          ))}
                        </span>
                      )}
                      {sort === 'value'
                        ? values?.prices.has(c.id) && <span className="slot-price">{formatValue(values.prices.get(c.id) ?? null)}</span>
                        : !complete && inGoal && price !== undefined && <span className="slot-price">{price === null ? 'no price' : formatEur(price)}</span>}
                      {qty && qty > 1 ? <span className="qty-badge">{qty}×</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
