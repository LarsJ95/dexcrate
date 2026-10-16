import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { useCatalogInfos } from '../hooks/useCatalogInfos'
import { useCountUp } from '../hooks/useCountUp'
import { marketValueOf, summarizeMarket, topMovers, type Mover, type PriceMap, type SeriesPoint } from '../lib/prices'
import { speciesName } from '../lib/runner'
import { setOfKey } from '../lib/tcgdex'
import { rememberFavouriteType } from '../lib/energy'
import { celebrateBadges } from '../lib/moments'
import { englishSpeciesName, isNonLatin } from '../lib/names'
import { rememberAutoPartner, usePartnerChoice } from '../lib/partner'
import { badges, dominantType, hpLevel, partnerDexId, pokedexProgress, typeTeam, type OwnedInfo } from '../lib/trainer'
import { celebrateProgress, rememberTrainerName, syncCratePoints, toProgressCards } from '../lib/celebrate'
import { achievements, dailyDexId, levelFor, weekReport, xpFor } from '../lib/progress'
import { BadgeCase } from './BadgeCase'
import { DailyPokemon, WeekReportPanel } from './DailyPanels'
import { EvolutionPanel } from './EvolutionPanel'
import { PokedexSheet, type DexEntry } from './PokedexSheet'
import { BuyingChances } from './BuyingChances'
import { Partner, PokedexPanel, TrainerCard, TypeTeamPanel } from './TrainerCard'
import { computeStats, formatEur, type Bucket } from '../lib/stats'
import { thumbPath, type Card } from '../lib/types'
import { CardImage } from './CardImage'
import { ChangeBadge } from './ChangeBadge'
import { LineChart } from './LineChart'
import { Spotlight } from './Spotlight'

interface Props {
  cards: Card[]
  prices: PriceMap
  pricesLoading: boolean
  /** Waardeverloop uit dagelijkse opnames; null = (nog) niet beschikbaar. */
  series: SeriesPoint[] | null
  /** Kaart openen in de popup. */
  onOpenCard?: (id: string) => void
  /** Waardeoverzicht onder het hoofdcijfer (kosten, marktwaarde, eigen waardering, resultaat). */
  breakdown?: ReactNode
  /** Naam op de Trainer Card. */
  trainer?: string
}

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 1 })

const countLabel = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Bedrag met expliciet teken, zodat winst/verlies niet alleen via kleur leesbaar is. */
function signedEur(n: number): string {
  if (n === 0) return formatEur(0)
  return `${n > 0 ? '+' : '−'}${formatEur(Math.abs(n))}`
}

function Tile({ label, bucket, unit }: { label: string; bucket: Bucket; unit: string }): JSX.Element {
  return (
    <a className="stat" href="#/collection">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{formatEur(bucket.amount)}</span>
      <span className="stat-sub">{bucket.unknown > 0 ? `${unit}, ${bucket.unknown} without price` : unit}</span>
    </a>
  )
}

function MoverList({
  title,
  flavor,
  items,
  empty,
  onOpenCard,
}: {
  title: string
  /** Spelzin onder de titel, bv. "It's super effective!". */
  flavor?: string
  items: Mover<Card>[]
  empty: string
  onOpenCard?: (id: string) => void
}): JSX.Element {
  return (
    <div className="panel">
      <h2 className="panel-title">{title}</h2>
      {flavor && <p className="flavor">{flavor}</p>}
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ol className="mover-list">
          {items.map(({ card, market }) => (
            <li key={card.id}>
              {/* Naam uit de zichtbare tekst (naam, nummer, prijs); de thumbnail herhaalt alleen de naam. */}
              <button type="button" className="mover" onClick={() => onOpenCard?.(card.id)}>
                <span aria-hidden="true">
                  <CardImage tcgdexId={card.tcgdex_id} kind={card.kind} name={card.name} photoPath={thumbPath(card)}
            detail={[card.set_code, card.card_number && `#${card.card_number}`].filter(Boolean).join(' ')} />
                </span>
                <span className="mover-name">
                  {card.name}
                  {card.card_number && <span className="muted"> #{card.card_number}</span>}
                </span>
                <span className="mover-price">
                  {formatEur(market.value)}
                  <ChangeBadge change={market.change30} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function DashboardView({ cards, prices, pricesLoading, series, onOpenCard, breakdown, trainer = 'Trainer' }: Props): JSX.Element {
  const stats = useMemo(() => computeStats(cards), [cards])
  const market = useMemo(() => summarizeMarket(cards, prices), [cards, prices])
  const movers = useMemo(() => topMovers(cards, prices), [cards, prices])
  const shownValue = useCountUp(pricesLoading ? null : market.owned.value)

  // Pokémon-laag: typekleur, Pokédex, partner en badges uit de kaartinfo (7 dagen gecachet).
  const ownedCards = useMemo(() => cards.filter((c) => c.ownership === 'owned' && c.kind === 'card'), [cards])
  const ownedKeys = useMemo(() => ownedCards.flatMap((c) => (c.tcgdex_id ? [c.tcgdex_id] : [])), [ownedCards])
  const infos = useCatalogInfos(ownedKeys, true)
  const owned = useMemo<(OwnedInfo & { name: string })[]>(
    () =>
      ownedCards.map((c) => {
        const info = c.tcgdex_id ? infos.get(c.tcgdex_id) : null
        return { quantity: c.quantity, value: marketValueOf(c, prices)?.value ?? null, types: info?.types ?? null, dexId: info?.dexId ?? null, name: info?.name ?? c.name }
      }),
    [ownedCards, infos, prices],
  )
  const infosLoading = new Set(ownedKeys).size > infos.size
  const dex = useMemo(() => pokedexProgress(owned.flatMap((o) => (o.dexId ? [o.dexId] : []))), [owned])
  const favourite = useMemo(() => dominantType(owned), [owned])
  // Onthouden voor kaarten zonder eigen kleur (Colorless) in de kaartpopup.
  useEffect(() => {
    if (favourite) rememberFavouriteType(favourite)
  }, [favourite])
  const autoPartner = useMemo(() => {
    const dexId = partnerDexId(owned)
    const card = owned.find((o) => o.dexId === dexId)
    return dexId && card ? { dexId, name: speciesName(card.name) } : null
  }, [owned])
  // Zelf gekozen partner gaat voor; de automatische onthouden voor de partner op andere pagina's.
  const chosen = usePartnerChoice()
  const partner = chosen ? { dexId: chosen.dex, name: chosen.name } : autoPartner
  useEffect(() => {
    if (!autoPartner) return
    const { dexId, name } = autoPartner
    if (!isNonLatin(name)) {
      rememberAutoPartner({ dex: dexId, name })
      return
    }
    // Japanse/Chinese kaart: Engelse soortnaam ophalen.
    void englishSpeciesName(dexId).then((en) => rememberAutoPartner({ dex: dexId, name: en ?? name }))
  }, [autoPartner])
  const cardCount = ownedCards.reduce((n, c) => n + c.quantity, 0)
  const setsStarted = useMemo(() => new Set(ownedKeys.flatMap((k) => setOfKey(k)?.setId ?? [])).size, [ownedKeys])
  const since = useMemo(() => cards.reduce<string | null>((first, c) => (c.created_at && (!first || c.created_at < first) ? c.created_at : first), null), [cards])
  const badgeList = badges({ cards: cardCount, species: dex.caught, value: market.owned.value })
  const team = useMemo(() => typeTeam(owned), [owned])
  // Voortgang: XP/level, verborgen prestaties, Pokémon van de dag, weekrapport.
  const progressCards = useMemo(
    () => toProgressCards(cards, (k) => infos.get(k), (c) => marketValueOf(c, prices)?.value ?? null),
    [cards, infos, prices],
  )
  const badgesEarned = badgeList.filter((b) => b.earned).length
  const level = levelFor(xpFor(progressCards, badgesEarned))
  const secrets = useMemo(() => achievements(progressCards), [progressCards])
  const daily = dailyDexId(new Date())
  const dailyOwned = owned.reduce((n, o) => n + (o.dexId === daily ? o.quantity : 0), 0)
  const week = useMemo(() => weekReport(progressCards, new Date()), [progressCards])
  useEffect(() => {
    rememberTrainerName(trainer)
  }, [trainer])
  useEffect(() => {
    if (infosLoading || pricesLoading) return
    celebrateProgress(progressCards, badgesEarned)
    void syncCratePoints(progressCards, 'Daily bonus and your collection')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen als het laden klaar is of de stand verandert
  }, [infosLoading, pricesLoading, level.level, secrets.filter((s) => s.earned).length])
  const ownedDex = useMemo(() => new Set(owned.flatMap((o) => (o.dexId ? [o.dexId] : []))), [owned])
  const [badgeCaseOpen, setBadgeCaseOpen] = useState(false)
  const [region, setRegion] = useState<number | null>(null)
  // Pokédex-nummer → jouw kaarten van die Pokémon (voor het Pokédex-raster).
  const caught = useMemo(() => {
    const map = new Map<number, DexEntry>()
    for (const c of ownedCards) {
      const dexId = c.tcgdex_id ? infos.get(c.tcgdex_id)?.dexId : null
      if (!dexId) continue
      const entry = map.get(dexId) ?? { cards: [] }
      entry.cards.push({ id: c.id, name: [c.name, c.set_code, c.card_number && `#${c.card_number}`].filter(Boolean).join(' ') })
      map.set(dexId, entry)
    }
    return map
  }, [ownedCards, infos])
  // Nieuwe badge vieren, pas als kaartinfo en prijzen binnen zijn (anders lijkt er even iets te verdwijnen).
  const earnedKey = badgeList.filter((b) => b.earned).map((b) => b.id).join(',')
  useEffect(() => {
    if (infosLoading || pricesLoading) return
    celebrateBadges(badgeList.filter((b) => b.earned))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij een andere set verdiende badges
  }, [earnedKey, infosLoading, pricesLoading])

  if (cards.length === 0) {
    return (
      <section className="page">
        <p className="empty">
          No cards yet. <a href="#/import">Import your Excel file</a> or <a href="#/scan">scan a card</a>.
        </p>
      </section>
    )
  }

  const listed = stats.sold.count + stats.forSale.count
  const askingDiff = market.forSale.value > 0 ? market.forSale.asking / market.forSale.value - 1 : null

  return (
    <section className="page dashboard">
      <div className="dash-main">
      <h1>Overview</h1>

      <div className="hero">
        {partner && <Partner dexId={partner.dexId} name={partner.name} />}
        <span className="stat-label">Collection value</span>
        <p className="hero-value">{pricesLoading || shownValue === null ? '…' : formatEur(shownValue)}</p>
        {!pricesLoading && (
          <div className="hero-sub">
            {market.change30 !== null && <ChangeBadge change={market.change30} label="vs 30-day average" />}
            <span>{countLabel(market.owned.withPrice + market.owned.withoutPrice, 'card', 'cards')}</span>
            {/* Waarde telt alleen kaarten met marktprijs; de rest is onbekend, niet € 0. */}
            {market.owned.withoutPrice > 0 && <span>{market.owned.withoutPrice} without market price</span>}
            {market.paper.count > 0 && (
              <span>
                Paid {formatEur(market.paper.cost)} for the {countLabel(market.paper.count, 'card', 'cards')} with known cost,{' '}
                <strong className={market.paper.gain >= 0 ? 'up' : 'down'}>{signedEur(market.paper.gain)}</strong>
              </span>
            )}
          </div>
        )}
        {series && series.length >= 2 && <LineChart points={series} label="Value history" valueLabel="Value" />}
      </div>

      {!pricesLoading && movers.valuable[0] && <Spotlight item={movers.valuable[0]} onOpenCard={onOpenCard} fallbackType={favourite} />}

      {breakdown}

      {!pricesLoading && (
        <div className="movers">
          <MoverList title="Gainers" flavor="It's super effective!" items={movers.up} empty="No clear risers." onOpenCard={onOpenCard} />
          <MoverList title="Losers" flavor="It's not very effective…" items={movers.down} empty="No clear fallers." onOpenCard={onOpenCard} />
          <MoverList title="Most valuable" items={movers.valuable} empty="No market prices yet." onOpenCard={onOpenCard} />
        </div>
      )}

      <h2 className="section-title">Sales</h2>

      <div className="stat-row">
        <a className="stat" href="#/collection">
          <span className="stat-label">Net (sold − bought)</span>
          <span className={`stat-value${stats.netComplete ? (stats.net >= 0 ? ' up' : ' down') : ''}`}>{signedEur(stats.net)}</span>
          <span className="stat-sub">
            {/* Onbekende kosten/opbrengsten: geen definitief resultaat tonen. */}
            {stats.netComplete
              ? stats.net >= 0
                ? 'Profit'
                : 'To recoup'
              : `Incomplete: ${countLabel(stats.costUnknown, 'card', 'cards')} without purchase price${stats.sold.unknown > 0 ? `, ${stats.sold.unknown} sold without price` : ''}`}
          </span>
        </a>
        <Tile label="Sold" bucket={stats.sold} unit={countLabel(stats.sold.count, 'card', 'cards')} />
        <Tile label="For sale" bucket={stats.forSale} unit={countLabel(stats.forSale.count, 'card', 'cards')} />
        <Tile label="Bought" bucket={stats.bought} unit={countLabel(stats.bought.count, 'item', 'items')} />
      </div>

      <div className="split-panels">
        <div className="panel">
          <div className="meter-head">
            <span className="stat-label" id="ratio-label">
              Sell-through
            </span>
            <span className="meter-value">{pct.format(stats.sellRatio)}</span>
          </div>
          <span
            className="meter"
            role="meter"
            aria-labelledby="ratio-label"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(stats.sellRatio * 1000) / 10}
            aria-valuetext={`${stats.sold.count} of ${listed} cards sold`}
          >
            <span className="meter-fill" data-hp={hpLevel(stats.sellRatio)} style={{ width: `${stats.sellRatio * 100}%` }} />
          </span>
          <p className="muted small">
            {stats.sold.count} of {countLabel(listed, 'card', 'cards')} sold
          </p>
        </div>

        {askingDiff !== null && (
          <div className="panel">
            <span className="stat-label">Asking vs market</span>
            <span className="meter-value">
              {pct.format(Math.abs(askingDiff))} {askingDiff >= 0 ? 'above' : 'below'}
            </span>
            <p className="muted small">
              Asking {formatEur(market.forSale.asking)}, market {formatEur(market.forSale.value)}
            </p>
          </div>
        )}
      </div>

      <dl className="averages">
        <div>
          <dt>Avg. sale price</dt>
          <dd>{formatEur(stats.avgSold)}</dd>
        </div>
        <div>
          <dt>Avg. purchase price</dt>
          <dd>{formatEur(stats.avgBought)}</dd>
        </div>
        <div>
          <dt>Avg. asking price</dt>
          <dd>{formatEur(stats.avgForSale)}</dd>
        </div>
      </dl>
      </div>

      {/* Trainer-zijkolom: op brede schermen rechts, anders direct onder het hoofdpaneel. */}
      <aside className="dash-rail" aria-label="Trainer">
        <TrainerCard
          name={trainer}
          cards={cardCount}
          species={dex.caught}
          setsStarted={setsStarted}
          since={since}
          badges={badgeList}
          onOpenBadges={() => setBadgeCaseOpen(true)}
          level={level}
        />
        <DailyPokemon key={daily} dexId={daily} ownedCount={infosLoading ? 0 : dailyOwned} />
        <PokedexPanel progress={dex} loading={infosLoading} onOpenRegion={setRegion} />
        <TypeTeamPanel team={team} />
        <EvolutionPanel owned={ownedDex} />
        <BuyingChances />
        <WeekReportPanel report={week} trainer={trainer} partnerDex={partner?.dexId ?? null} />
      </aside>
      {badgeCaseOpen && <BadgeCase badges={badgeList} secrets={secrets} onClose={() => setBadgeCaseOpen(false)} />}
      {region !== null && <PokedexSheet gen={region} caught={caught} onClose={() => setRegion(null)} onOpenCard={(id) => onOpenCard?.(id)} />}
    </section>
  )
}
