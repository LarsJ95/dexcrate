import { useState, type CSSProperties, type JSX } from 'react'
import { useKeyed } from '../hooks/useKeyed'
import { burstFrom } from '../lib/fx'
import { useMotion } from '../lib/motion'
import { englishSpeciesName, isNonLatin } from '../lib/names'
import { spriteUrls } from '../lib/runner'
import { REGIONS, hpLevel, trainerTitle, type Badge, type DexProgress } from '../lib/trainer'

/** Eén badge: eenvoudige achthoekige medaille in de badgekleur; nog niet verdiend = grijs. */
export function BadgeIcon({ badge }: { badge: Pick<Badge, 'earned' | 'color'> }): JSX.Element {
  return (
    <svg className={`badge-icon${badge.earned ? ' is-earned' : ''}`} style={{ '--badge': badge.color } as CSSProperties} viewBox="0 0 40 40" aria-hidden="true">
      <polygon className="badge-outer" points="13,2 27,2 38,13 38,27 27,38 13,38 2,27 2,13" />
      <polygon className="badge-inner" points="16,9 24,9 31,16 31,24 24,31 16,31 9,24 9,16" />
      <circle className="badge-shine" cx="15" cy="14" r="3" />
    </svg>
  )
}

interface TrainerProps {
  name: string
  cards: number
  species: number
  setsStarted: number
  since: string | null
  badges: Badge[]
  /** Badgekoffer openen (uitleg en voortgang per badge). */
  onOpenBadges: () => void
  /** Trainer-level en XP (berekend uit je collectie). */
  level: { level: number; into: number; needed: number }
}

const sinceFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/** Trainer Card zoals in de games: naam, titel, je cijfers en je badges. */
export function TrainerCard({ name, cards, species, setsStarted, since, badges, onOpenBadges, level }: TrainerProps): JSX.Element {
  const earned = badges.filter((b) => b.earned).length
  const { title, next } = trainerTitle(earned)
  const sinceDate = since ? new Date(since) : null
  return (
    <section className="panel trainer-card" aria-labelledby="trainer-title">
      <header className="trainer-head">
        <div>
          <span className="stat-label">Trainer card</span>
          <h2 id="trainer-title">
            {name} <span className="trainer-level">Lv. {level.level}</span>
          </h2>
        </div>
        <span className="trainer-rank" title={next ? `${next.badges} badges for ${next.title}` : 'Highest rank'}>
          {title}
        </span>
      </header>
      <div className="xp">
        <span className="xp-head small">
          <span>EXP</span>
          <span className="muted">{level.needed > 0 ? `${level.into} / ${level.needed} to Lv. ${level.level + 1}` : 'Max level'}</span>
        </span>
        <span className="xp-bar" role="meter" aria-label="Experience" aria-valuemin={0} aria-valuemax={level.needed || 1} aria-valuenow={level.needed ? level.into : 1}>
          <span style={{ width: `${level.needed ? (level.into / level.needed) * 100 : 100}%` }} />
        </span>
      </div>
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
      <button type="button" className="trainer-badges" onClick={onOpenBadges} aria-label={`Badges: ${earned} of ${badges.length}. Show how to earn them.`}>
        <span className="trainer-badges-head">
          <span className="stat-label">
            Badges {earned}/{badges.length}
          </span>
          <span className="small trainer-badges-hint">How to earn ›</span>
        </span>
        <span className="badge-row">
          {badges.map((b) => (
            <span key={b.id} className="badge" title={`${b.name}: ${b.goal}`}>
              <BadgeIcon badge={b} />
              {!b.earned && (
                <span className="badge-progress">
                  <span style={{ width: `${b.progress * 100}%` }} />
                </span>
              )}
            </span>
          ))}
        </span>
      </button>
    </section>
  )
}

/** Pokédex als het rode apparaat uit de games: totaal, en per regio een knop naar het Pokédex-raster. */
export function PokedexPanel({ progress, loading, onOpenRegion }: { progress: DexProgress; loading: boolean; onOpenRegion: (gen: number) => void }): JSX.Element {
  return (
    <section className="panel pokedex" aria-labelledby="pokedex-title">
      <div className="dex-top" aria-hidden="true">
        <span className="dex-lens" />
        <span className="dex-light red" />
        <span className="dex-light yellow" />
        <span className="dex-light green" />
      </div>
      <div className="dex-screen">
        <div className="meter-head">
          <h2 id="pokedex-title" className="stat-label">
            Pokédex
          </h2>
          <span className="meter-value">
            {progress.caught}
            <span className="small"> / {progress.total} caught</span>
          </span>
        </div>
        <span className="meter" role="meter" aria-label="Pokédex" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.caught}>
          <span className="meter-fill" data-hp={hpLevel(progress.caught / progress.total)} style={{ width: `${(progress.caught / progress.total) * 100}%` }} />
        </span>
        <ol className="dex-gens" aria-label="Per region">
          {progress.perGen.map((g) => (
            <li key={g.gen}>
              <button type="button" className="dex-gen" onClick={() => onOpenRegion(g.gen)} aria-label={`${REGIONS[g.gen - 1]} (generation ${g.gen}): ${g.caught} of ${g.total}. Open.`}>
                <span className="dex-gen-bar" aria-hidden="true">
                  <span style={{ height: `${Math.max(g.caught > 0 ? 8 : 0, (g.caught / g.total) * 100)}%` }} />
                </span>
                <span className="dex-gen-name">{REGIONS[g.gen - 1]}</span>
                <span className="dex-gen-count">
                  {g.caught}/{g.total}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="small dex-hint">{loading ? 'Counting your Pokémon…' : 'Tap a region to see which Pokémon you have.'}</p>
      </div>
    </section>
  )
}

const loadEnglishName = (key: string): Promise<string | null> => englishSpeciesName(Number(key))

/** Partner-Pokémon naast je collectiewaarde; tikken laat hem springen en roepen. */
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
