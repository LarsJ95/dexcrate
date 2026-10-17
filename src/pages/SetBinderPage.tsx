import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { listCards } from '../lib/db'
import { rarityRule } from '../lib/cardTraits'
import { burstFrom } from '../lib/fx'
import { SET_MILESTONES, celebrateMilestone, showMoment } from '../lib/moments'
import { crateForSet } from '../lib/celebrate'
import { hpLevel } from '../lib/trainer'
import { DEFAULT_GOAL, goalProgress, goalRequirements, type GoalSettings, type OwnedCopy, type RequirementState } from '../lib/goals'
import { marketValue } from '../lib/prices'
import { isValueSort, sortSetCards, type SetSort } from '../lib/setSort'
import { VARIANT_LABELS } from '../lib/types'
import { loadGoal } from '../lib/wishlist'
import { BinderSlot } from '../components/BinderSlot'
import { BinderToolbar, CostPanel, GoalStats, type BinderShow } from '../components/SetBinderParts'
import { GoalSheet } from '../components/GoalSheet'
import { IconArrowLeft } from '../components/Icons'
import { SetCardSheet, type SheetNav } from '../components/SetCardSheet'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useSetRarities } from '../hooks/useSetRarities'
import { useSetValues } from '../hooks/useSetValues'
import { useSetVariants } from '../hooks/useSetVariants'
import { useWishlistEnabled } from '../hooks/useWishlistEnabled'
import { getCardPrice, getSet, isLang, setOfKey, type SetCard, type SetSummary } from '../lib/tcgdex'
import { Loading } from '../components/Loading'
import { COMPLETE_KEY, MAX_NEW, MILESTONE_KEY, PAGE_SIZE_KEY, SEEN_KEY, SPARKLE_COLORS, VARIANT_SHORT, readPageSize, readSeen, remember, stateKey, type Cost, type PageSize } from '../lib/setBinder'
import { errorText } from '../lib/errors'

interface Props {
  /** "<taal>/<set-id>" uit de URL. */
  param: string
}

interface Loaded {
  summary: SetSummary
  cards: SetCard[]
  /** kaart-id → aantal in bezit (elke uitvoering, incl. onderweg) */
  owned: Map<string, number>
  /** Eigen exemplaren in deze set, voor het verzameldoel. */
  copies: OwnedCopy[]
}


export function SetBinderPage({ param }: Props): JSX.Element {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<BinderShow>('all')
  const [pageSize, setPageSize] = useState<PageSize>(readPageSize)
  const [cost, setCost] = useState<Cost | null>(null)
  const [openCard, setOpenCard] = useState<SetCard | null>(null)
  // Elke set begint in setvolgorde; een andere sortering geldt alleen voor deze set (niet onthouden).
  const [sort, setSort] = useState<SetSort>('number')
  const cancelCost = useRef(false)
  // Verzameldoel (STAP6): wat telt mee voor "compleet".
  const goalsEnabled = useWishlistEnabled() === true
  const [goal, setGoal] = useState<GoalSettings>(DEFAULT_GOAL)
  const [goalOpen, setGoalOpen] = useState(false)

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
        if (!cancelled) setError(errorText(err, 'Loading failed.'))
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

  // Doel per uitvoering: uitvoeringen van elke kaart ophalen.
  const { variantsByCard, loading: variantsLoading } = useSetVariants(lang, data?.cards ?? null, goal.variants.length > 0)

  // Sorteren op waarde: marktprijs van elke kaart, geladen zodra je die sortering kiest.
  const values = useSetValues(lang, data?.cards ?? null, isValueSort(sort))

  // Sorteren op zeldzaamheid: kaartinfo (7 dagen gecachet).
  const cardKeys = useMemo(() => (data && isLang(lang) ? data.cards.map((c) => `${lang}/${c.id}`) : []), [data, lang])
  const setRarities = useSetRarities(lang, data?.summary.id ?? null, sort === 'rarity')
  const infos = useCatalogInfos(cardKeys, sort === 'rarity' && setRarities === null)
  const raritiesReady = setRarities ? true : setRarities === null ? infos.size >= cardKeys.length : false
  const ranks = useMemo(() => {
    const map = new Map<string, number>()
    if (setRarities) {
      for (const [id, rarity] of setRarities) if (rarity) map.set(id, rarityRule(rarity).rank)
      return map
    }
    for (const [key, info] of infos) if (info) map.set(key.slice(key.indexOf('/') + 1), rarityRule(info.rarity).rank)
    return map
  }, [infos, setRarities])

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
    // Op waarde of zeldzaamheid pas sorteren als alles binnen is; anders springen kaarten tijdens het laden.
    const ready = isValueSort(sort) ? values !== null && values.done >= values.total : sort === 'rarity' ? raritiesReady : true
    return sortSetCards(shown, ready ? sort : 'number', { complete, value: values?.prices ?? new Map(), rank: ranks })
  }, [data, show, statesByCard, sort, values, ranks, raritiesReady])

  // Altijd binderpagina's van 6 of 9, ook gesorteerd (dan in de gekozen volgorde).
  const pages = useMemo(() => {
    const out: SetCard[][] = []
    for (let i = 0; i < visible.length; i += pageSize) out.push(visible.slice(i, i + pageSize))
    return out
  }, [visible, pageSize])

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

  // Kaartvenster: bladeren door de kaarten zoals ze nu getoond worden (filter en sortering).
  const openIndex = openCard ? visible.findIndex((c) => c.id === openCard.id) : -1
  const sheetNav = (i: number): SheetNav | undefined =>
    i < 0
      ? undefined
      : {
          position: i + 1,
          total: visible.length,
          onPrev: i > 0 ? () => setOpenCard(visible[i - 1]) : null,
          onNext: i < visible.length - 1 ? () => setOpenCard(visible[i + 1]) : null,
        }

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
    void crateForSet(`${lang}/${setId}`, data.summary.name)
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

      <GoalStats progress={progress} variantsLoading={variantsLoading} />

      {missingCount > 0 && data.cards.length > 0 && (
        <CostPanel missingCount={missingCount} unit={unit} cost={cost} costSummary={costSummary} onCalculate={() => void calculateCost()} />
      )}

      <BinderToolbar show={show} onShow={setShow} pageSize={pageSize} onPageSize={changePageSize} sort={sort} onSort={setSort} />
      {isValueSort(sort) && values && values.done < values.total && (
        <p className="muted small" aria-live="polite">
          Loading prices… {values.done} of {values.total}
        </p>
      )}
      {sort === 'rarity' && !raritiesReady && (
        <p className="muted small" aria-live="polite">
          Loading rarities…{setRarities === null ? ` ${infos.size} of ${cardKeys.length}` : ''}
        </p>
      )}

      {data.cards.length === 0 && (
        <p className="notice">No card list is available for this set.</p>
      )}

      {openCard && isLang(lang) && (
        <SetCardSheet
          lang={lang}
          card={openCard}
          setName={data.summary.name}
          setCode={data.summary.abbr ?? data.summary.id}
          owned={data.owned.get(openCard.id) ?? 0}
          nav={sheetNav(openIndex)}
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

      <div className="binder-pages">
        {pages.map((page, i) => (
          <section key={i} className="binder-page" aria-label={`Page ${i + 1}`}>
            <p className="binder-page-label">Page {i + 1}</p>
            <ul className="binder set-binder" style={{ ['--binder-cols' as string]: pageSize === 6 ? 2 : 3 }}>
              {page.map((c) => (
                <BinderSlot
                  key={c.id}
                  card={c}
                  lang={lang}
                  setId={data.summary.id}
                  qty={data.owned.get(c.id)}
                  states={statesByCard.get(c.id) ?? []}
                  cost={cost}
                  sort={sort}
                  values={values}
                  newIndex={newIds.has(c.id) ? [...newIds].indexOf(c.id) : null}
                  onOpen={setOpenCard}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
