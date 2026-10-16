import { useState, type JSX } from 'react'
import { burstFrom } from '../lib/fx'
import { useMoment, type Moment } from '../lib/moments'
import { useMotion } from '../lib/motion'
import { usePartner } from '../lib/partner'
import { spriteUrls } from '../lib/runner'

/** Wat je partner zegt bij een moment. */
function cheer(m: Moment): string {
  if (m.kind === 'reveal') return m.caught ? 'Gotcha!' : 'Wow!'
  if (m.kind === 'gotcha') return 'Let’s find it!'
  if (m.kind === 'complete') return 'Set complete!'
  return 'Yay!'
}

/** Je partner loopt mee (zijbalk of kopbalk): springt bij elke viering en als je erop tikt. */
export function PartnerBuddy({ compact = false }: { compact?: boolean }): JSX.Element {
  const partner = usePartner()
  const motion = useMotion()
  const moment = useMoment()
  const [tap, setTap] = useState<{ n: number; say: string | null }>({ n: 0, say: null })
  const [failed, setFailed] = useState<number | null>(null)
  const [gif, png] = spriteUrls(partner.dex, false)
  const src = motion && failed !== partner.dex ? gif : png
  // Bij een moment springen (nieuwe sleutel = animatie opnieuw), anders bij tikken.
  const jumpKey = moment ? `m${moment.id}` : `t${tap.n}`
  const jumping = Boolean(moment) || tap.n > 0
  const say = moment ? cheer(moment) : tap.say
  return (
    <button
      type="button"
      className={`buddy${compact ? ' is-compact' : ''}`}
      aria-label={`Your partner: ${partner.name}`}
      title={partner.name}
      onClick={(e) => {
        if (!motion) return
        const el = e.currentTarget
        setTap((t) => ({ n: t.n + 1, say: `${partner.name}!` }))
        burstFrom(el, { colors: ['var(--yellow)', '#ffffff', 'var(--type)'], count: 12, speed: 4, gravity: 0.1 })
        window.setTimeout(() => setTap((t) => ({ ...t, say: null })), 1300)
      }}
    >
      {say && motion && <span className="runner-bubble">{say}</span>}
      <span key={jumpKey} className={`partner-hop${jumping && motion ? ' is-jump' : ''}`}>
        <img src={src} alt="" draggable={false} onError={() => setFailed(partner.dex)} />
      </span>
    </button>
  )
}
