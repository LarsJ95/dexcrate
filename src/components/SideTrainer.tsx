import type { JSX } from 'react'
import { BADGES_KEY, LEVEL_KEY } from '../lib/moments'
import { trainerName, trainerTitle } from '../lib/trainer'
import { PartnerBuddy } from './PartnerBuddy'

/** Level en aantal badges zoals Home ze het laatst onthield (per apparaat); geen opslag = geen level. */
function readProgress(): { level: number | null; badges: number } {
  try {
    const level = Number.parseInt(localStorage.getItem(LEVEL_KEY) ?? '', 10)
    const badges = (localStorage.getItem(BADGES_KEY) ?? '').split(',').filter(Boolean).length
    return { level: Number.isInteger(level) && level > 0 ? level : null, badges }
  } catch {
    return { level: null, badges: 0 }
  }
}

/**
 * Onderaan de zijbalk (24-10-2026, "gezelliger menu"): je partner op een grasveldje met je trainernaam, level en
 * titel, in plaats van alleen het e-mailadres (dat staat nog in de tooltip).
 */
export function SideTrainer({ email }: { email: string | null }): JSX.Element {
  const { level, badges } = readProgress()
  const { title } = trainerTitle(badges)
  return (
    <div className="side-trainer">
      <span className="side-trainer-stage">
        <PartnerBuddy />
      </span>
      <a className="side-trainer-text" href="#/overview" title={email ?? undefined}>
        <span className="side-trainer-name">
          <strong>{trainerName(email)}</strong>
          {level !== null && <span className="trainer-level">Lv. {level}</span>}
        </span>
        <span className="small">{title}</span>
      </a>
    </div>
  )
}
