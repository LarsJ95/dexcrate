import type { JSX } from 'react'
import { formatEur } from '../lib/stats'
import { TITLES, hpLevel, trainerTitle, type Badge } from '../lib/trainer'
import type { Achievement } from '../lib/progress'
import { Sheet } from './Sheet'
import { BadgeIcon } from './TrainerCard'

const progressText = (b: Badge): string =>
  b.kind === 'value' ? `${formatEur(Math.min(b.have, b.target))} of ${formatEur(b.target)}` : `${Math.min(b.have, b.target)} of ${b.target}`

/** Badgekoffer: per badge wat je nodig hebt en hoe ver je bent, plus de trainer-titels. */
export function BadgeCase({ badges, secrets, onClose }: { badges: Badge[]; secrets: Achievement[]; onClose: () => void }): JSX.Element {
  const earned = badges.filter((b) => b.earned).length
  const { title, next } = trainerTitle(earned)
  return (
    <Sheet title={`Badge case: ${earned} of ${badges.length}`} onClose={onClose}>
      <p className="muted">Earn badges by growing your collection, like the gym badges in the games. More badges give you a higher trainer rank.</p>
      <ol className="badge-case">
        {badges.map((b) => (
          <li key={b.id} className={b.earned ? 'is-earned' : ''}>
            <BadgeIcon badge={b} />
            <div className="badge-case-info">
              <strong>
                {b.name}
                {b.earned && <span className="up small"> Earned</span>}
              </strong>
              <span className="small">{b.goal}</span>
              <span className="muted small">{b.how}</span>
              <span className="meter" role="meter" aria-label={`${b.name} progress`} aria-valuemin={0} aria-valuemax={b.target} aria-valuenow={Math.min(b.have, b.target)}>
                <span className="meter-fill" data-hp={hpLevel(b.progress)} style={{ width: `${b.progress * 100}%` }} />
              </span>
              <span className="muted small">{progressText(b)}</span>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="section-title">
        Secret achievements {secrets.filter((s) => s.earned).length}/{secrets.length}
      </h3>
      <p className="muted small">Hidden until you find them.</p>
      <ol className="secret-list">
        {secrets.map((s) => (
          <li key={s.id} className={s.earned ? 'is-earned' : ''}>
            <span className="secret-icon" aria-hidden="true">
              {s.earned ? '★' : '?'}
            </span>
            <span>
              <strong>{s.earned ? s.name : '???'}</strong>
              {s.earned && <span className="muted small"> {s.how}</span>}
            </span>
          </li>
        ))}
      </ol>
      <h3 className="section-title">Trainer rank</h3>
      <ol className="rank-ladder">
        {TITLES.map((t) => (
          <li key={t.title} aria-current={t.title === title ? 'step' : undefined}>
            <span>{t.title}</span>
            <span className="muted small">{t.badges === 0 ? 'Start' : `${t.badges} ${t.badges === 1 ? 'badge' : 'badges'}`}</span>
          </li>
        ))}
      </ol>
      {next && (
        <p className="small">
          {next.badges - earned} more {next.badges - earned === 1 ? 'badge' : 'badges'} to become {next.title}.
        </p>
      )}
    </Sheet>
  )
}
