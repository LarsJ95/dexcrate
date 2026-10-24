import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import { CardFace } from '../components/CardFace'
import { CrateCardSheet, CrateTilePrice } from '../components/CrateCardSheet'
import { CrateOverview, CrateStats } from '../components/CrateOverview'
import { CatalogKeyPicture } from '../components/CatalogCardPicture'
import { HoloCard } from '../components/HoloCard'
import { PackOpening } from '../components/PackOpening'
import { CatalogFilterFields } from '../components/CatalogFilterFields'
import { FilterPanel } from '../components/FilterPanel'
import { EmptyState } from '../components/EmptyState'
import { IconCrate, IconSearch } from '../components/Icons'
import { Loading } from '../components/Loading'
import { RaritySymbols } from '../components/RaritySymbols'
import { SearchClear } from '../components/SearchClear'
import { useCardPrices } from '../hooks/useCardPrices'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useDbFeature } from '../hooks/useDbFeature'
import { foilStyleFor } from '../lib/cardTraits'
import {
  OLD_RULES,
  PACKS,
  canAfford,
  crateSetDone,
  crateSetProgress,
  getCrateRules,
  getDailyPack,
  hasCrate,
  listCrateCards,
  openPack as drawAndOpen,
  packCost,
  packStep,
  packsByCost,
  syncCrate,
  tradeAllDuplicates,
  tradeCrateCard,
  tradeValue,
  type CrateCard,
  type CrateRules,
  type PackKind,
  type PackPull,
} from '../lib/crate'
import { LOCAL_SET_IDS } from '../lib/localCatalog'
import { CRATE_MILESTONES, CRATE_MILESTONE_KEY, celebrateMilestone, showMoment } from '../lib/moments'
import { marketValue } from '../lib/prices'
import { digitalSetIds, getSetList } from '../lib/tcgdex'
import { buzz } from '../lib/haptics'
import { errorText } from '../lib/errors'
import { needsCatalog } from '../lib/collectionFilters'
import { CRATE_SORTS, NO_CRATE_FILTERS, crateFilterChips, crateFilterCount, crateSetOptions, matchesCrate, matchesCrateSearch, sortCrate, type CrateFilters, type CrateSort } from '../lib/crateFilters'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { useStoredChoice } from '../hooks/useStoredChoice'
import { useLoadMore } from '../hooks/useLoadMore'
import { useCountTo, useDelta } from '../hooks/useCountTo'

/** Tabbladen (24-10-2026: "Overview" en "Cards" stonden verwarrend midden op de pagina); het laatste wordt onthouden. */
type View = 'packs' | 'cards' | 'overview'
const VIEWS: readonly View[] = ['packs', 'cards', 'overview']

/** Zo verdien je punten; dagbonus, inruilwaarde en Crate-set volgen de regels uit de database. */
function earnRows(rules: CrateRules): [string, string][] {
  return [
    ['Add a card to your collection', '10 + up to 20 for rarity'],
    ['Record a sale', '15'],
    ['Record a purchase', '5'],
    ['New Pokémon in your Pokédex', '25'],
    ['Complete a set in your collection', '250'],
    ...(rules.crateSet ? [['Complete a set in your pack collection', String(rules.crateSet)] as [string, string]] : []),
    ['Open the app (daily bonus)', String(rules.daily)],
    ['Trade in a duplicate', `${2 * rules.tradeFactor} to ${30 * rules.tradeFactor}`],
  ]
}

/** Prijzen voor een ontbrekende kaart (Overview → Sets → Missing cards). */
function craftRows(rules: CrateRules): [string, string][] {
  const c = rules.craft
  const row = (label: string, v: number | undefined): [string, string][] => (v ? [[label, `${v} pts`]] : [])
  return [
    ...row('Common', c.common),
    ...row('Uncommon', c.uncommon),
    ...row('Rare or holo', c.rare),
    ...row('Double or Ultra rare', c.double),
    ...row('Illustration rare', c.illustration),
    ...row('Special illustration, Hyper or secret rare', c.special),
  ]
}

/** Pakjes in groepen (binnen een groep op prijs): gratis/dagelijks en de rest. */
const PACK_GROUPS: readonly { id: string; title: string; kinds: readonly PackKind[] }[] = [
  { id: 'daily', title: 'Every day', kinds: ['booster', 'daily'] },
  { id: 'packs', title: 'Packs', kinds: ['lucky', 'set', 'great', 'master'] },
]

interface SetChoice {
  key: string
  id: string
  name: string
  official: number
}

interface Loaded {
  points: number
  freePack: boolean
  /** Punten boven het dagplafond die de volgende dagen binnenkomen (STAP27). */
  waiting: number
  cards: CrateCard[]
  rules: CrateRules
}

/** Stand ophalen; bijwerken zonder bonus/Pokédex (die komen via Overview en het toevoegen van kaarten). */
async function loadCrate(): Promise<Loaded> {
  // Tegelijk (24-10-2026): de sync telt alleen punten, de kaartenlijst hoeft daar niet op te wachten.
  const [w, rules, cards] = await Promise.all([syncCrate({}, []), getCrateRules(), listCrateCards()])
  return { points: w.points, freePack: w.freePack, waiting: w.waiting, cards, rules }
}

/** Engelse sets voor het Set pack, nieuwste eerst; zonder digitale (TCG Pocket), eigen catalogus (geen zeldzaamheden) en sets zonder telling. */
async function loadSetChoices(): Promise<SetChoice[]> {
  const [list, digital] = await Promise.all([getSetList('en'), digitalSetIds('en')])
  return [...list.values()]
    .filter((s) => !digital.has(s.id) && !LOCAL_SET_IDS.has(s.id) && (s.official ?? 0) >= 5)
    .map((s) => ({ key: `en/${s.id}`, id: s.id, name: s.name, official: s.official ?? 0 }))
    .reverse()
}

/** Crate: verdien punten met je echte collectie en open er virtuele pakjes mee. */
export function CratePage(): JSX.Element {
  const enabled = useDbFeature(hasCrate, 'crate')
  const [points, setPoints] = useState<number | null>(null)
  const [freePack, setFreePack] = useState(false)
  const [waiting, setWaiting] = useState(0)
  const [cards, setCards] = useState<CrateCard[] | null>(null)
  // Pack opening in een popup; id = nieuwe popup per pakje (ook bij "Open another").
  const openingSeq = useRef(0)
  const [opening, setOpening] = useState<{ id: number; pack: PackKind; pulls: PackPull[]; god: boolean; before: ReadonlyMap<string, number> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useStoredChoice<CrateSort>('dexcrate:crate-sort', CRATE_SORTS, 'newest')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<CrateFilters>(NO_CRATE_FILTERS)
  const [view, setView] = useStoredChoice<View>('dexcrate:crate-view', VIEWS, 'packs')
  const [opened, setOpened] = useState<CrateCard | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [rules, setRules] = useState<CrateRules>(OLD_RULES)
  // Tot de echte regels binnen zijn: geen oude prijzen of "Not set up yet" tonen.
  const [rulesLoaded, setRulesLoaded] = useState(false)
  const [setChoices, setSetChoices] = useState<SetChoice[]>([])
  const [packSet, setPackSet] = useState('')
  const [daily, setDaily] = useState<{ id: string; name: string } | null>(null)
  // Sets waarvoor deze sessie al om de Crate-setbonus is gevraagd.
  const askedSets = useRef<Set<string>>(new Set())

  const apply = useCallback((d: Loaded): void => {
    setPoints(d.points)
    setFreePack(d.freePack)
    setWaiting(d.waiting)
    setCards(d.cards)
    setRules(d.rules)
    setRulesLoaded(true)
  }, [])

  const reload = useCallback((): void => {
    loadCrate()
      .then(apply)
      .catch((err: unknown) => setError(errorText(err, 'Loading the Pack game failed.')))
  }, [apply])

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    // Regels apart en meteen (één verzoek), niet pas na je hele Crate-collectie.
    getCrateRules()
      .then((r) => {
        if (cancelled) return
        setRules(r)
        setRulesLoaded(true)
      })
      .catch((err: unknown) => console.warn('Crate-regels laden mislukt', err))
    loadCrate()
      .then((d) => {
        if (!cancelled) apply(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading the Pack game failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [enabled, apply])

  // Sets voor het Set pack (alleen met STAP18); standaard de nieuwste.
  const setPackOn = packCost(rules, 'set') !== null
  useEffect(() => {
    if (!setPackOn) return
    let cancelled = false
    loadSetChoices()
      .then((list) => {
        if (cancelled) return
        setSetChoices(list)
        setPackSet((cur) => cur || list[0]?.id || '')
      })
      .catch((err: unknown) => console.warn('Sets voor het Set pack ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [setPackOn])

  // Pakje van de dag (STAP26): welke set vandaag.
  const dailyPackOn = packCost(rules, 'daily') !== null
  useEffect(() => {
    if (!dailyPackOn) return
    let cancelled = false
    getDailyPack()
      .then((d) => {
        if (!cancelled) setDaily(d)
      })
      .catch((err: unknown) => console.warn('Pakje van de dag ophalen mislukt', err))
    return () => {
      cancelled = true
    }
  }, [dailyPackOn])

  // Complete set in je Crate: bonus (één keer per set; de database bewaakt dat).
  const crateSetBonus = rules.crateSet
  useEffect(() => {
    if (!crateSetBonus || !cards || setChoices.length === 0) return
    const keys = new Set(cards.map((c) => c.tcgdexId.slice(0, c.tcgdexId.lastIndexOf('-'))))
    for (const s of setChoices) {
      if (!keys.has(s.key) || askedSets.current.has(s.key) || crateSetProgress(cards, s.key, s.official) < s.official) continue
      askedSets.current.add(s.key)
      crateSetDone(s.key, s.official)
        .then((gained) => {
          if (gained <= 0) return
          setPoints((p) => (p === null ? p : p + gained))
          showMoment({ kind: 'points', amount: gained, reason: `${s.name} complete in your pack collection` })
        })
        .catch((err: unknown) => console.warn('Crate-setbonus mislukt', err))
    }
  }, [cards, setChoices, crateSetBonus])

  // Mijlpalen van je pack collection (verschillende kaarten); niet tijdens een pakje, wel na het sluiten.
  useEffect(() => {
    if (cards && !opening) celebrateMilestone(CRATE_MILESTONE_KEY, cards.length, CRATE_MILESTONES, (n) => `${n} different cards in your pack collection`, 'Pack game milestone!')
  }, [cards, opening])

  // Punten lopen zichtbaar op of af, met het verschil er even naast.
  const shownPoints = useCountTo(points)
  const delta = useDelta(points)

  const chosenSet = setChoices.find((s) => s.id === packSet) ?? null
  const chosenSetHave = chosenSet && cards ? crateSetProgress(cards, chosenSet.key, chosenSet.official) : 0

  async function openPack(pack: PackKind): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Actuele Crate (ook na een vorig pakje of inruilen in de popup): voor NEW, "je hebt er nu N" en ontbrekend eerst.
      const fresh = await listCrateCards()
      setCards(fresh)
      const before = new Map(fresh.map((c) => [c.tcgdexId, c.quantity]))
      const result = await drawAndOpen(pack, { setId: packSet || undefined, owned: new Set(before.keys()) })
      setPoints(result.points)
      setFreePack(result.freePack)
      setOpening({ id: ++openingSeq.current, pack, pulls: result.pulls, god: result.god, before })
    } catch (err) {
      setError(errorText(err, 'Opening the pack failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function tradeIn(card: CrateCard): Promise<void> {
    if (busy || card.quantity < 2) return
    setBusy(true)
    setError(null)
    try {
      const r = await tradeCrateCard(card.tcgdexId, card.quantity - 1)
      setPoints(r.points)
      setCards((list) => list?.map((c) => (c.tcgdexId === card.tcgdexId ? { ...c, quantity: 1 } : c)) ?? null)
      setOpened((o) => (o?.tcgdexId === card.tcgdexId ? { ...o, quantity: 1 } : o))
    } catch (err) {
      setError(errorText(err, 'Trading in failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function tradeInAll(): Promise<void> {
    if (busy || !cards) return
    setBusy(true)
    setError(null)
    setConfirmAll(false)
    try {
      const r = await tradeAllDuplicates(cards)
      setPoints(r.points)
      buzz([20])
    } catch (err) {
      setError(errorText(err, 'Trading in failed.'))
    } finally {
      // Altijd opnieuw laden: bij een fout halverwege klopt de lijst dan met de database.
      setBusy(false)
      reload()
    }
  }

  // Type, kaarttype en illustrator staan in de catalogus: alleen ophalen als erop gefilterd wordt.
  const catalogKeys = useMemo(() => (cards ?? []).map((c) => c.tcgdexId), [cards])
  const infos = useCatalogInfos(catalogKeys, needsCatalog({ ...filters, rarity: '' }))
  // Prijs per exemplaar voor de statistiekbalk en het overzicht; ontbreekt zolang hij laadt, null = geen prijs.
  const cardPrices = useCardPrices(catalogKeys, true)
  const prices = useMemo(() => new Map([...cardPrices].map(([id, p]) => [id, marketValue(p, null)?.value ?? null] as const)), [cardPrices])
  const setOptions = useMemo(() => crateSetOptions(cards ?? []), [cards])
  // Prijzen alleen bij sorteren op prijs (anders hoeft de lijst niet opnieuw bij elke binnengekomen prijs).
  const sortPrices = sort === 'price-high' || sort === 'price-low' ? prices : undefined
  const sorted = useMemo(
    () => sortCrate((cards ?? []).filter((c) => matchesCrateSearch(c, query) && matchesCrate(c, filters, infos.get(c.tcgdexId))), sort, sortPrices),
    [cards, query, filters, infos, sort, sortPrices],
  )
  // Kaarten in stukken van 48 (24-10-2026: 700+ kaarten tegelijk maakte de pagina traag), zoals My cards.
  const { count: shownCards, sentinel: moreCardsRef } = useLoadMore(sorted.length, `${view}|${query}|${sort}|${JSON.stringify(filters)}`, 48)
  const activeFilters = crateFilterCount(filters)
  const extras = (cards ?? []).reduce((n, c) => n + (c.quantity - 1) * tradeValue(c.rarity, rules.tradeFactor), 0)
  const extraCopies = (cards ?? []).reduce((n, c) => n + c.quantity - 1, 0)

  // Alle dubbelen inruilen (met bevestigen): in de statistiekbalk bovenaan.
  const tradeAll =
    extras > 0 ? (
      <div className="crate-trade-all" role="group" aria-label="Trade in duplicates">
        {confirmAll ? (
          <>
            <span>
              Trade in {extraCopies} duplicate {extraCopies === 1 ? 'copy' : 'copies'} for {extras} points? You keep one of each card.
            </span>
            <button type="button" className="primary small-btn" onClick={() => void tradeInAll()} disabled={busy}>
              Trade in
            </button>
            <button type="button" className="small-btn" onClick={() => setConfirmAll(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="small-btn" onClick={() => setConfirmAll(true)} disabled={busy}>
            Trade in all duplicates (+{extras} pts)
          </button>
        )}
      </div>
    ) : null

  if (enabled === false) {
    return (
      <section className="page">
        <h1>Pack game</h1>
        <p className="notice">The Pack game is not set up yet: run STAP11 in Supabase.</p>
      </section>
    )
  }

  return (
    <section className="page crate">
      <div className="page-head">
        <div>
          <h1>Pack game</h1>
          <p className="muted">Earn Pack points with your real collection and open virtual packs. These virtual cards are separate from your real cards.</p>
        </div>
        <div className="segmented crate-tabs" role="group" aria-label="Pack game">
          <button type="button" aria-pressed={view === 'packs'} onClick={() => setView('packs')}>
            Packs
          </button>
          <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
            Cards{cards ? ` (${cards.length.toLocaleString('en-IE')})` : ''}
          </button>
          <button type="button" aria-pressed={view === 'overview'} onClick={() => setView('overview')}>
            Overview
          </button>
        </div>
      </div>

      <div className="crate-top">
        <section className="panel crate-wallet" aria-label="Pack points">
          <span className="crate-coin" aria-hidden="true">
            <IconCrate size={28} />
          </span>
          <div>
            <span className="stat-label">Pack points</span>
            {/* Aantal tekens voor de lettergrootte: grote getallen worden kleiner in plaats van uit het vak te lopen. */}
            <p className="crate-points" style={{ '--pts-len': (points ?? 0).toLocaleString('en-IE').length } as CSSProperties}>
              {shownPoints === null ? '…' : shownPoints.toLocaleString('en-IE')}
              {delta && (
                <span key={delta.key} className={`pts-chip${delta.n < 0 ? ' is-minus' : ''}`} aria-hidden="true">
                  {delta.n > 0 ? '+' : '−'}
                  {Math.abs(delta.n).toLocaleString('en-IE')}
                </span>
              )}
            </p>
            {waiting > 0 && (
              <p className="small muted crate-waiting">
                +{waiting.toLocaleString('en-IE')} on the way{rules.earnCap ? ` (max. ${rules.earnCap.toLocaleString('en-IE')} a day from your collection)` : ''}
              </p>
            )}
          </div>
        </section>
        {cards && cards.length > 0 && <CrateStats cards={cards} prices={prices} tradeFactor={rules.tradeFactor} tradeAll={tradeAll} />}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {view === 'packs' && (
        <div className="crate-pack-groups">
        {PACK_GROUPS.map((group) => {
          const kinds = packsByCost(rules).filter((k) => group.kinds.includes(k))
          return (
            <section key={group.id} className="crate-pack-group" aria-labelledby={`crate-packs-${group.id}`}>
              <h2 id={`crate-packs-${group.id}`} className="section-title">
                {group.title}
              </h2>
              {/* --n: aantal pakjes; op brede schermen vullen ze samen de hele rij. */}
              <ul className="crate-packs" style={{ '--n': kinds.length } as CSSProperties}>
        {kinds.map((kind) => {
          const p = PACKS[kind]
          const cost = packCost(rules, kind)
          const free = kind === 'booster' && freePack
          const ok = points !== null && canAfford(rules, kind, points, freePack) && (kind !== 'set' || packSet !== '')
          return (
            <li key={kind} className={`panel crate-shop pack-${kind}`}>
              {/* Vaste rijen (titel, uitleg, keuze, melding, knop), via subgrid gelijk over alle pakjes in een rij. */}
              <div className="crate-pack-art" aria-hidden="true">
                <span className="pokeball" />
              </div>
              <strong className="crate-shop-title">{p.name}</strong>
              <span className="muted small crate-shop-text">{p.contents}</span>
              <div className="crate-shop-choice">
                {cost === null && rulesLoaded && <span className="small muted">Not set up yet: run {packStep(kind)} in Supabase.</span>}
                {cost !== null && kind === 'daily' && <span className="small">{daily ? `Today: ${daily.name}` : 'Loading today’s set…'}</span>}
                {cost !== null && kind === 'set' && (
                  <>
                    <label className="crate-pack-choice">
                      <span className="visually-hidden">Set</span>
                      <select value={packSet} onChange={(e) => setPackSet(e.target.value)} disabled={setChoices.length === 0}>
                        {setChoices.length === 0 && <option value="">Loading sets…</option>}
                        {setChoices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {chosenSet && (
                      <span className="small muted">
                        {chosenSetHave}/{chosenSet.official} collected{rules.crateSet ? ` · +${rules.crateSet} when complete` : ''}
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="small muted crate-shop-note">
                {cost !== null && !ok && points !== null && points < cost && !free ? `You need ${(cost - points).toLocaleString('en-IE')} more points.` : ''}
              </span>
              {!rulesLoaded ? (
                <button type="button" className="primary crate-shop-open" disabled>
                  Loading…
                </button>
              ) : (
                cost !== null && (
                  <button type="button" className="primary crate-shop-open" onClick={() => void openPack(kind)} disabled={busy || !ok || opening !== null}>
                    {busy ? 'Opening…' : free ? 'Open free daily pack' : `Open (${cost.toLocaleString('en-IE')} points)`}
                  </button>
                )
              )}
            </li>
          )
        })}
              </ul>
            </section>
          )
        })}
        </div>
      )}

      {opening && (
        <PackOpening
          key={opening.id}
          pack={opening.pack}
          pulls={opening.pulls}
          god={opening.god}
          before={opening.before}
          tradeFactor={rules.tradeFactor}
          onOpenAnother={points !== null && canAfford(rules, opening.pack, points, freePack) ? () => void openPack(opening.pack) : null}
          opening={busy}
          error={error}
          onPoints={setPoints}
          onClose={() => {
            setOpening(null)
            setError(null)
            reload()
          }}
        />
      )}

      {view !== 'packs' && (
      <section className="crate-collection" aria-label={view === 'cards' ? 'Your pack collection' : 'Pack collection overview'}>
        {view === 'cards' && cards && cards.length > 1 && (
          <FilterPanel
            activeCount={activeFilters}
            canClear={activeFilters > 0 || query !== ''}
            onClear={() => {
              setFilters(NO_CRATE_FILTERS)
              setQuery('')
            }}
            chips={crateFilterChips(filters, (key) => setOptions.find((o) => o.key === key)?.label ?? key).map((c) => ({
              ...c,
              onRemove: () => setFilters((f) => ({ ...f, [c.key]: NO_CRATE_FILTERS[c.key] })),
            }))}
            resultCount={sorted.length}
            toolbar={
              <>
                <div className="search">
                  <IconSearch size={18} />
                  <input
                    type="search"
                    placeholder="Search name or set"
                    aria-label="Search your pack collection"
                    enterKeyHint="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={closeKeyboardOnEnter}
                  />
                  <SearchClear value={query} onClear={() => setQuery('')} />
                </div>
                <select className="toolbar-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as CrateSort)}>
                  <option value="newest">Newest first</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="rarity">Rarest first</option>
                  <option value="set">Set and number</option>
                  <option value="copies">Most copies</option>
                  <option value="name">Name A–Z</option>
                </select>
              </>
            }
          >
            <label className="span-2">
              Set
              <select value={filters.set} onChange={(e) => setFilters((f) => ({ ...f, set: e.target.value }))}>
                <option value="">All</option>
                {setOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <CatalogFilterFields value={filters} onChange={(next) => setFilters((f) => ({ ...f, ...next }))} />
            <label>
              Illustrator
              <input value={filters.illustrator} maxLength={60} placeholder="e.g. Arita" onChange={(e) => setFilters((f) => ({ ...f, illustrator: e.target.value }))} />
            </label>
            <div className="filter-checks">
              <label className="check">
                <input type="checkbox" checked={filters.duplicates} onChange={(e) => setFilters((f) => ({ ...f, duplicates: e.target.checked }))} />
                Only duplicates
              </label>
            </div>
          </FilterPanel>
        )}
        {cards === null && !error && <Loading />}
        {cards?.length === 0 && (
          <EmptyState
            title="No virtual cards yet"
            action={
              freePack ? (
                <button type="button" className="primary" onClick={() => void openPack('booster')} disabled={busy || opening !== null}>
                  Open your free pack
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => setView('packs')}>
                  Go to Packs
                </button>
              )
            }
          >
            Open a pack to start your pack collection: a separate, virtual collection you build with Pack points. Your daily Booster pack is free.
          </EmptyState>
        )}
        {view === 'overview' && cards && cards.length > 0 && (
          <CrateOverview
            cards={cards}
            prices={prices}
            onOpen={setOpened}
            tradeFactor={rules.tradeFactor}
            rules={rules}
            points={points ?? 0}
            onBought={(p) => {
              setPoints(p)
              buzz([20])
              reload()
            }}
          />
        )}
        {view === 'cards' && cards && cards.length > 0 && sorted.length === 0 && (
          <EmptyState
            action={
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  setFilters(NO_CRATE_FILTERS)
                  setQuery('')
                }}
              >
                Clear filters
              </button>
            }
          >
            No cards match these filters.
          </EmptyState>
        )}
        {view === 'cards' && sorted.length > 0 && (
          <ul className="catalog-grid crate-grid">
            {sorted.slice(0, shownCards).map((c) => (
              <li key={c.tcgdexId} className="crate-card">
                <button type="button" className="crate-card-open" onClick={() => setOpened(c)} aria-label={`${c.name}, ${c.quantity}×. Show details`}>
                  <HoloCard foil={foilStyleFor(null, c.rarity)}>
                    <CatalogKeyPicture cardKey={c.tcgdexId} image={c.image} name={c.name} quality="low" alt={c.name} fallback={<CardFace name={c.name} detail={c.setName} />} />
                  </HoloCard>
                  {c.quantity > 1 && <span className="qty-badge">{c.quantity}×</span>}
                </button>
                <span className="catalog-name">{c.name}</span>
                <span className="muted small">
                  <RaritySymbols rarity={c.rarity} /> {c.setName ?? ''}
                </span>
                <CrateTilePrice tcgdexId={c.tcgdexId} />
                {c.quantity > 1 && (
                  <button type="button" className="small-btn" onClick={() => void tradeIn(c)} disabled={busy}>
                    Trade {c.quantity - 1} for {(c.quantity - 1) * tradeValue(c.rarity, rules.tradeFactor)} pts
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {view === 'cards' && sorted.length > shownCards && (
          <div ref={moreCardsRef} className="catalog-more">
            <Loading text={`Loading more cards… (${sorted.length - shownCards} left)`} />
          </div>
        )}
      </section>
      )}

      {opened && <CrateCardSheet card={opened} busy={busy} onTrade={(c) => void tradeIn(c)} onClose={() => setOpened(null)} tradeFactor={rules.tradeFactor} />}

      {view === 'packs' && (
      <details className="panel crate-earn">
        <summary>How to earn Pack points</summary>
        <dl>
          {earnRows(rules).map(([what, pts]) => (
            <div key={what}>
              <dt>{what}</dt>
              <dd>{pts}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">Each card counts once (adding the same card again gives nothing), sales and purchases at most 20 a day. One free pack every day.</p>
        {rules.earnCap && (
          <p className="muted small">
            Fair play: at most {rules.earnCap.toLocaleString('en-IE')} points a day from your collection (cards, Pokédex, complete sets, sales and purchases). Anything above that comes in on the next days. Sales and purchases only count with at least one card in them.
          </p>
        )}
        {craftRows(rules).length > 0 && (
          <>
            <h3 className="small">Buy a missing card</h3>
            <dl>
              {craftRows(rules).map(([what, pts]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd>{pts}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </details>
      )}
    </section>
  )
}
