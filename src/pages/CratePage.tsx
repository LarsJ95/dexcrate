import { useCallback, useEffect, useMemo, useState, type CSSProperties, type JSX } from 'react'
import { CardFace } from '../components/CardFace'
import { CatalogKeyPicture } from '../components/CatalogCardPicture'
import { HoloCard } from '../components/HoloCard'
import { IconCrate } from '../components/Icons'
import { Loading } from '../components/Loading'
import { RaritySymbols } from '../components/RaritySymbols'
import { useDbFeature } from '../hooks/useDbFeature'
import { foilStyleFor, rarityRule } from '../lib/cardTraits'
import { PACK_COST, drawPack, hasCrate, listCrateCards, openCratePack, syncCrate, tradeCrateCard, type CrateCard, type PackPull } from '../lib/crate'
import { burstFrom } from '../lib/fx'
import { buzz } from '../lib/haptics'
import { useMotion } from '../lib/motion'

type Sort = 'newest' | 'rarity' | 'name'

/** Inruilwaarde per extra exemplaar (gelijk aan de databasefunctie crate_trade). */
function tradeValue(rarity: string | null): number {
  const r = (rarity ?? '').toLowerCase()
  if (['special illustration rare', 'hyper rare', 'mega hyper rare', 'crown'].includes(r)) return 30
  if (['illustration rare', 'secret rare', 'shiny ultra rare'].includes(r)) return 15
  if (['double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare'].includes(r)) return 10
  if (r.includes('rare')) return 5
  if (r === 'uncommon') return 3
  return 2
}

const EARN = [
  ['Add a card to your collection', '10 + up to 20 for rarity'],
  ['Record a sale', '15'],
  ['Record a purchase', '5'],
  ['New Pokémon in your Pokédex', '25'],
  ['Complete a set', '250'],
  ['Open the app (daily bonus)', '50'],
  ['Trade in a duplicate', '2 to 30'],
] as const

function PackReveal({ pulls, onDone }: { pulls: PackPull[]; onDone: () => void }): JSX.Element {
  // Zeldzaamste als laatste.
  const order = useMemo(() => [...pulls].sort((a, b) => rarityRule(a.rarity).rank - rarityRule(b.rarity).rank), [pulls])
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const motion = useMotion()
  const all = open.size === order.length

  function flip(i: number, el: HTMLElement | null): void {
    if (open.has(i)) return
    setOpen((s) => new Set(s).add(i))
    const rank = rarityRule(order[i].rarity).rank
    if (el && motion && rank >= 5) {
      burstFrom(el, { colors: rank >= 9 ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : ['var(--yellow)', '#ffffff', 'var(--type)'], count: rank >= 9 ? 60 : 30, speed: 8 })
      buzz(rank >= 9 ? [40, 60, 40] : [20])
    }
  }

  return (
    <section className="panel crate-reveal" aria-label="Your pack">
      <p className="muted small">{all ? 'All cards revealed.' : 'Tap a card to flip it.'}</p>
      <ol className="crate-pack">
        {order.map((p, i) => {
          const shown = open.has(i)
          return (
            <li key={`${p.tcgdex_id}-${i}`} className={i === order.length - 1 ? 'is-last' : ''}>
              <button
                type="button"
                className={`crate-slot${shown ? ' is-open' : ''}`}
                onClick={(e) => flip(i, e.currentTarget)}
                aria-label={shown ? `${p.name}, ${p.rarity}` : `Card ${i + 1}, face down. Flip.`}
                style={{ '--i': i } as CSSProperties}
              >
                <span className="crate-flip">
                  <span className="moment-face moment-back" aria-hidden="true">
                    <span className="pokeball" />
                  </span>
                  <span className="moment-face moment-front">
                    <HoloCard foil={foilStyleFor(null, p.rarity)}>
                      <CatalogKeyPicture cardKey={p.tcgdex_id} image={p.image} name={p.name} quality="low" alt={p.name} fallback={<CardFace name={p.name} detail={p.set_name} />} />
                    </HoloCard>
                  </span>
                </span>
              </button>
              {shown && (
                <span className="crate-pull-name small">
                  {p.name} <RaritySymbols rarity={p.rarity} />
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="sheet-foot">
        {!all && (
          <button type="button" onClick={() => setOpen(new Set(order.map((_, i) => i)))}>
            Reveal all
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="primary" onClick={onDone}>
          {all ? 'Add to my Crate' : 'Skip'}
        </button>
      </div>
    </section>
  )
}

interface Loaded {
  points: number
  freePack: boolean
  cards: CrateCard[]
}

/** Stand ophalen; bijwerken zonder bonus/Pokédex (die komen via Overview en het toevoegen van kaarten). */
async function loadCrate(): Promise<Loaded> {
  const w = await syncCrate({}, [])
  return { points: w.points, freePack: w.freePack, cards: await listCrateCards() }
}

/** Crate: verdien punten met je echte collectie en open er virtuele pakjes mee. */
export function CratePage(): JSX.Element {
  const enabled = useDbFeature(hasCrate)
  const [points, setPoints] = useState<number | null>(null)
  const [freePack, setFreePack] = useState(false)
  const [cards, setCards] = useState<CrateCard[] | null>(null)
  const [pulls, setPulls] = useState<PackPull[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('newest')

  const apply = useCallback((d: Loaded): void => {
    setPoints(d.points)
    setFreePack(d.freePack)
    setCards(d.cards)
  }, [])

  const reload = useCallback((): void => {
    loadCrate()
      .then(apply)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Loading the Crate failed.'))
  }, [apply])

  useEffect(() => {
    if (enabled !== true) return
    let cancelled = false
    loadCrate()
      .then((d) => {
        if (!cancelled) apply(d)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading the Crate failed.')
      })
    return () => {
      cancelled = true
    }
  }, [enabled, apply])

  async function openPack(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const drawn = await drawPack()
      const result = await openCratePack(drawn)
      setPoints(result.points)
      setFreePack(false)
      setPulls(drawn)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opening the pack failed.')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trading in failed.')
    } finally {
      setBusy(false)
    }
  }

  const sorted = useMemo(() => {
    const list = [...(cards ?? [])]
    if (sort === 'rarity') list.sort((a, b) => rarityRule(b.rarity).rank - rarityRule(a.rarity).rank || a.name.localeCompare(b.name, 'en'))
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    return list
  }, [cards, sort])
  const total = (cards ?? []).reduce((n, c) => n + c.quantity, 0)
  const extras = (cards ?? []).reduce((n, c) => n + (c.quantity - 1) * tradeValue(c.rarity), 0)

  if (enabled === false) {
    return (
      <section className="page">
        <h1>Crate</h1>
        <p className="notice">The Crate game is not set up yet: run STAP11 in Supabase.</p>
      </section>
    )
  }

  const canOpen = freePack || (points ?? 0) >= PACK_COST

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
            <p className="crate-points">{points === null ? '…' : points.toLocaleString('en-IE')}</p>
          </div>
        </section>

        <section className="panel crate-shop" aria-label="Open a pack">
          <div className="crate-pack-art" aria-hidden="true">
            <span className="pokeball" />
          </div>
          <div className="crate-shop-info">
            <strong>Booster pack</strong>
            <span className="muted small">10 random cards from all English sets: 6 common, 3 uncommon and 1 rare or better.</span>
            <button type="button" className="primary" onClick={() => void openPack()} disabled={busy || !canOpen || pulls !== null || points === null}>
              {busy ? 'Opening…' : freePack ? 'Open free daily pack' : `Open pack (${PACK_COST} points)`}
            </button>
            {!canOpen && points !== null && <span className="small muted">You need {PACK_COST - points} more points.</span>}
          </div>
        </section>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {pulls && (
        <PackReveal
          pulls={pulls}
          onDone={() => {
            setPulls(null)
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
          {cards && cards.length > 1 && (
            <select className="catalog-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="rarity">Rarest first</option>
              <option value="name">Name A–Z</option>
            </select>
          )}
        </div>
        {extras > 0 && <p className="muted small">Your duplicates are worth {extras} points if you trade them in.</p>}
        {cards === null && !error && <Loading />}
        {cards?.length === 0 && <p className="empty">No virtual cards yet. Open your first pack above.</p>}
        {sorted.length > 0 && (
          <ul className="catalog-grid crate-grid">
            {sorted.map((c) => (
              <li key={c.tcgdexId} className="crate-card">
                <HoloCard foil={foilStyleFor(null, c.rarity)}>
                  <CatalogKeyPicture cardKey={c.tcgdexId} image={c.image} name={c.name} quality="low" alt={c.name} fallback={<CardFace name={c.name} detail={c.setName} />} />
                </HoloCard>
                {c.quantity > 1 && <span className="qty-badge">{c.quantity}×</span>}
                <span className="catalog-name">{c.name}</span>
                <span className="muted small">
                  <RaritySymbols rarity={c.rarity} /> {c.setName ?? ''}
                </span>
                {c.quantity > 1 && (
                  <button type="button" className="small-btn" onClick={() => void tradeIn(c)} disabled={busy}>
                    Trade {c.quantity - 1} for {(c.quantity - 1) * tradeValue(c.rarity)} pts
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="panel crate-earn">
        <summary>How to earn Crate points</summary>
        <dl>
          {EARN.map(([what, pts]) => (
            <div key={what}>
              <dt>{what}</dt>
              <dd>{pts}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">Each card, sale and purchase counts once. One free pack every day.</p>
      </details>
    </section>
  )
}
