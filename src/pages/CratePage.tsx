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
import { ENERGY_TYPES, foilStyleFor, isEnergyType, type EnergyType } from '../lib/cardTraits'
import {
  OLD_RULES,
  PACKS,
  canAfford,
  crateSetDone,
  crateSetProgress,
  getCrateRules,
  hasCrate,
  listCrateCards,
  openPack as drawAndOpen,
  packCost,
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
import { energyColor } from '../lib/energy'
import { LOCAL_SET_IDS } from '../lib/localCatalog'
import { showMoment } from '../lib/moments'
import { marketValue } from '../lib/prices'
import { digitalSetIds, getSetList } from '../lib/tcgdex'
import { buzz } from '../lib/haptics'
import { errorText } from '../lib/errors'
import { needsCatalog } from '../lib/collectionFilters'
import { CRATE_SORTS, NO_CRATE_FILTERS, crateFilterChips, crateFilterCount, crateSetOptions, matchesCrate, matchesCrateSearch, sortCrate, type CrateFilters, type CrateSort } from '../lib/crateFilters'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { useStoredChoice } from '../hooks/useStoredChoice'

type View = 'cards' | 'overview'

/** Zo verdien je punten; dagbonus, inruilwaarde en Crate-set volgen de regels uit de database. */
function earnRows(rules: CrateRules): [string, string][] {
  return [
    ['Add a card to your collection', '10 + up to 20 for rarity'],
    ['Record a sale', '15'],
    ['Record a purchase', '5'],
    ['New Pokémon in your Pokédex', '25'],
    ['Complete a set in your collection', '250'],
    ...(rules.crateSet ? [['Complete a set in your Crate', String(rules.crateSet)] as [string, string]] : []),
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

interface SetChoice {
  key: string
  id: string
  name: string
  official: number
}

interface Loaded {
  points: number
  freePack: boolean
  cards: CrateCard[]
  rules: CrateRules
}

/** Stand ophalen; bijwerken zonder bonus/Pokédex (die komen via Overview en het toevoegen van kaarten). */
async function loadCrate(): Promise<Loaded> {
  const [w, rules] = await Promise.all([syncCrate({}, []), getCrateRules()])
  return { points: w.points, freePack: w.freePack, cards: await listCrateCards(), rules }
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
  const [cards, setCards] = useState<CrateCard[] | null>(null)
  // Pack opening in een popup; id = nieuwe popup per pakje (ook bij "Open another").
  const openingSeq = useRef(0)
  const [opening, setOpening] = useState<{ id: number; pack: PackKind; pulls: PackPull[]; before: ReadonlyMap<string, number> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useStoredChoice<CrateSort>('dexcrate:crate-sort', CRATE_SORTS, 'newest')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<CrateFilters>(NO_CRATE_FILTERS)
  // Overview is de hoofdweergave (keuze gebruiker 18-10-2026).
  const [view, setView] = useState<View>('overview')
  const [opened, setOpened] = useState<CrateCard | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [rules, setRules] = useState<CrateRules>(OLD_RULES)
  const [setChoices, setSetChoices] = useState<SetChoice[]>([])
  const [packSet, setPackSet] = useState('')
  const [packType, setPackType] = useStoredChoice<EnergyType>('dexcrate:crate-pack-type', ENERGY_TYPES, 'Fire')
  // Sets waarvoor deze sessie al om de Crate-setbonus is gevraagd.
  const askedSets = useRef<Set<string>>(new Set())

  const apply = useCallback((d: Loaded): void => {
    setPoints(d.points)
    setFreePack(d.freePack)
    setCards(d.cards)
    setRules(d.rules)
  }, [])

  const reload = useCallback((): void => {
    loadCrate()
      .then(apply)
      .catch((err: unknown) => setError(errorText(err, 'Loading the Crate failed.')))
  }, [apply])

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    loadCrate()
      .then((d) => {
        if (!cancelled) apply(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Loading the Crate failed.'))
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
          showMoment({ kind: 'points', amount: gained, reason: `${s.name} complete in your Crate` })
        })
        .catch((err: unknown) => console.warn('Crate-setbonus mislukt', err))
    }
  }, [cards, setChoices, crateSetBonus])

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
      const result = await drawAndOpen(pack, { setId: packSet || undefined, type: packType, owned: new Set(before.keys()) })
      setPoints(result.points)
      setFreePack(result.freePack)
      setOpening({ id: ++openingSeq.current, pack, pulls: result.pulls, before })
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
  const sorted = useMemo(
    () => sortCrate((cards ?? []).filter((c) => matchesCrateSearch(c, query) && matchesCrate(c, filters, infos.get(c.tcgdexId))), sort),
    [cards, query, filters, infos, sort],
  )
  const activeFilters = crateFilterCount(filters)
  const total = (cards ?? []).reduce((n, c) => n + c.quantity, 0)
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
        <h1>Crate</h1>
        <p className="notice">The Crate game is not set up yet: run STAP11 in Supabase.</p>
      </section>
    )
  }

  return (
    <section className="page crate">
      <div className="page-head">
        <div>
          <h1>Crate</h1>
          <p className="muted">Earn Crate points with your real collection and open virtual packs. This collection is separate from your real cards.</p>
        </div>
      </div>

      <div className="crate-top">
        <section className="panel crate-wallet" aria-label="Crate points">
          <span className="crate-coin" aria-hidden="true">
            <IconCrate size={28} />
          </span>
          <div>
            <span className="stat-label">Crate points</span>
            {/* Aantal tekens voor de lettergrootte: grote getallen worden kleiner in plaats van uit het vak te lopen. */}
            <p className="crate-points" style={{ '--pts-len': (points ?? 0).toLocaleString('en-IE').length } as CSSProperties}>
              {points === null ? '…' : points.toLocaleString('en-IE')}
            </p>
          </div>
        </section>
        {cards && cards.length > 0 && <CrateStats cards={cards} prices={prices} tradeFactor={rules.tradeFactor} tradeAll={tradeAll} />}

        <ul className="crate-packs" aria-label="Packs">
        {packsByCost(rules).map((kind) => {
          const p = PACKS[kind]
          const cost = packCost(rules, kind)
          const free = kind === 'booster' && freePack
          const ok = points !== null && canAfford(rules, kind, points, freePack) && (kind !== 'set' || packSet !== '')
          const art = kind === 'type' ? ({ '--pack-type': energyColor(packType) } as CSSProperties) : undefined
          return (
            <li key={kind} className={`panel crate-shop pack-${kind}`}>
              {/* Vaste rijen (titel, uitleg, keuze, melding, knop), via subgrid gelijk over alle pakjes in een rij. */}
              <div className="crate-pack-art" aria-hidden="true" style={art}>
                <span className="pokeball" />
              </div>
              <strong className="crate-shop-title">{p.name}</strong>
              <span className="muted small crate-shop-text">{p.contents}</span>
              <div className="crate-shop-choice">
                {cost === null && <span className="small muted">Not set up yet: run STAP18 in Supabase.</span>}
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
                {cost !== null && kind === 'type' && (
                  <label className="crate-pack-choice">
                    <span className="visually-hidden">Type</span>
                    <select value={packType} onChange={(e) => isEnergyType(e.target.value) && setPackType(e.target.value)}>
                      {ENERGY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <span className="small muted crate-shop-note">
                {cost !== null && !ok && points !== null && points < cost && !free ? `You need ${(cost - points).toLocaleString('en-IE')} more points.` : ''}
              </span>
              {cost !== null && (
                <button type="button" className="primary crate-shop-open" onClick={() => void openPack(kind)} disabled={busy || !ok || opening !== null}>
                  {busy ? 'Opening…' : free ? 'Open free daily pack' : `Open (${cost.toLocaleString('en-IE')} points)`}
                </button>
              )}
            </li>
          )
        })}
        </ul>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {opening && (
        <PackOpening
          key={opening.id}
          pack={opening.pack}
          pulls={opening.pulls}
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

      <section className="crate-collection" aria-labelledby="crate-collection-title">
        <div className="catalog-head">
          <h2 id="crate-collection-title" className="section-title">
            Your Crate
          </h2>
          {cards && (
            <span className="muted small">
              {cards.length} different, {total} in total
            </span>
          )}
          {cards && cards.length > 0 && (
            <div className="segmented" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'overview'} onClick={() => setView('overview')}>
                Overview
              </button>
              <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                Cards
              </button>
            </div>
          )}
        </div>
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
                    aria-label="Search your Crate"
                    enterKeyHint="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={closeKeyboardOnEnter}
                  />
                  <SearchClear value={query} onClear={() => setQuery('')} />
                </div>
                <select className="toolbar-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as CrateSort)}>
                  <option value="newest">Newest first</option>
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
              ) : undefined
            }
          >
            Open a pack above to start your Crate: a separate, virtual collection you build with Crate points. Your daily Booster pack is free.
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
            {sorted.map((c) => (
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
      </section>

      {opened && <CrateCardSheet card={opened} busy={busy} onTrade={(c) => void tradeIn(c)} onClose={() => setOpened(null)} tradeFactor={rules.tradeFactor} />}

      <details className="panel crate-earn">
        <summary>How to earn Crate points</summary>
        <dl>
          {earnRows(rules).map(([what, pts]) => (
            <div key={what}>
              <dt>{what}</dt>
              <dd>{pts}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">Each card counts once (adding the same card again gives nothing), sales and purchases at most 20 a day. One free pack every day.</p>
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
    </section>
  )
}
