import { useState, type CSSProperties, type JSX } from 'react'
import { useKeyed } from '../hooks/useKeyed'
import { burstFrom } from '../lib/fx'
import { englishSpeciesName, isNonLatin } from '../lib/names'
import { useMotion } from '../lib/motion'
import { spriteUrls } from '../lib/runner'
import { hpLevel, type Badge, type DexProgress } from '../lib/trainer'

/** Eén badge: eenvoudige achthoekige medaille in de badgekleur; nog niet verdiend = grijs met voortgang. */
function BadgeIcon({ badge }: { badge: Badge }): JSX.Element {
  const label = `${badge.name}: ${badge.earned ? 'earned' : `${Math.round(badge.progress * 100)}% of ${badge.goal}`}`
  return (
    <li className={`badge${badge.earned ? ' is-earned' : ''}`} style={{ '--badge': badge.color } as CSSProperties} title={`${badge.name} (${badge.goal})`} aria-label={label}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <polygon className="badge-outer" points="13,2 27,2 38,13 38,27 27,38 13,38 2,27 2,13" />
        <polygon className="badge-inner" points="16,9 24,9 31,16 31,24 24,31 16,31 9,24 9,16" />
        <circle className="badge-shine" cx="15" cy="14" r="3" />
      </svg>
      {!badge.earned && (
        <span className="badge-progress" aria-hidden="true">
          <span style={{ width: `${badge.progress * 100}%` }} />
        </span>
      )}
    </li>
  )
}

interface TrainerProps {
  name: string
  cards: number
  species: number
  setsStarted: number
  since: string | null
  badges: Badge[]
}

const sinceFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/** Trainer Card zoals in de games: naam, je cijfers en je badges. */
export function TrainerCard({ name, cards, species, setsStarted, since, badges }: TrainerProps): JSX.Element {
  const earned = badges.filter((b) => b.earned).length
  const sinceDate = since ? new Date(since) : null
  return (
    <section className="panel trainer-card" aria-labelledby="trainer-title">
      <header className="trainer-head">
        <span className="stat-label">Trainer card</span>
        <h2 id="trainer-title">{name}</h2>
      </header>
      <dl className="trainer-stats">
        <div>
          <dt>Cards</dt>
          <dd>{cards}</dd>
        </div>
        <div>
          <dt>Pokémon</dt>
          <dd>{species}</dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd>{setsStarted}</dd>
        </div>
        {sinceDate && !Number.isNaN(sinceDate.getTime()) && (
          <div>
            <dt>Since</dt>
            <dd>{sinceFmt.format(sinceDate)}</dd>
          </div>
        )}
      </dl>
      <div className="trainer-badges">
        <span className="stat-label">
          Badges {earned}/{badges.length}
        </span>
        <ol className="badge-row">
          {badges.map((b) => (
            <BadgeIcon key={b.id} badge={b} />
          ))}
        </ol>
      </div>
    </section>
  )
}

/** Pokédex-teller: hoeveel verschillende Pokémon je hebt, in totaal en per generatie. */
export function PokedexPanel({ progress, loading }: { progress: DexProgress; loading: boolean }): JSX.Element {
  return (
    <section className="panel pokedex" aria-labelledby="pokedex-title">
      <div className="meter-head">
        <h2 id="pokedex-title" className="stat-label">
          Pokédex
        </h2>
        <span className="meter-value">
          {progress.caught}
          <span className="muted small"> / {progress.total} caught</span>
        </span>
      </div>
      <span
        className="meter hp"
        role="meter"
        aria-label="Pokédex"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.caught}
      >
        <span className="meter-fill" data-hp={hpLevel(progress.caught / progress.total)} style={{ width: `${(progress.caught / progress.total) * 100}%` }} />
      </span>
      <ol className="dex-gens" aria-label="Per generation">
        {progress.perGen.map((g) => (
          <li key={g.gen} title={`Generation ${g.gen}: ${g.caught} of ${g.total}`}>
            <span className="dex-gen-bar" aria-hidden="true">
              <span style={{ height: `${Math.max(g.caught > 0 ? 8 : 0, (g.caught / g.total) * 100)}%` }} />
            </span>
            <span className="dex-gen-label">
              {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][g.gen - 1]}
              <span className="visually-hidden">
                : {g.caught} of {g.total}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {loading && <p className="muted small">Counting your Pokémon…</p>}
    </section>
  )
}

/** Partner-Pokémon naast je collectiewaarde; tikken laat hem springen en roepen. */
const loadEnglishName = (key: string): Promise<string | null> => englishSpeciesName(Number(key))

export function Partner({ dexId, name: cardName }: { dexId: number; name: string }): JSX.Element {
  const motion = useMotion()
  // Japanse/Chinese/Koreaanse kaart: Engelse soortnaam via PokéAPI.
  const english = useKeyed(isNonLatin(cardName) ? String(dexId) : null, loadEnglishName)
  const name = english ?? cardName
  const [jump, setJump] = useState(0)
  const [say, setSay] = useState<string | null>(null)
  // Bewegend als animaties aan staan, anders de stilstaande sprite.
  const [src, still] = spriteUrls(dexId, false)
  const [failed, setFailed] = useState(false)
  return (
    <button
      type="button"
      className="partner"
      aria-label={`Your partner Pokémon: ${name}`}
      onClick={(e) => {
        if (!motion) return
        setJump((n) => n + 1)
        setSay(`${name}!`)
        burstFrom(e.currentTarget, { colors: ['var(--type)', '#ffffff', 'var(--yellow)'], count: 14, speed: 5, gravity: 0.1 })
        window.setTimeout(() => setSay(null), 1300)
      }}
    >
      {say && <span className="runner-bubble">{say}</span>}
      <span key={jump} className={`partner-hop${jump > 0 ? ' is-jump' : ''}`}>
        <img src={motion && !failed ? src : still} alt="" draggable={false} onError={() => setFailed(true)} />
      </span>
      <span className="partner-shadow" aria-hidden="true" />
    </button>
  )
}
