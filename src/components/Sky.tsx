import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { celebrateSecret } from '../lib/celebrate'
import { makeWish } from '../lib/crate'
import { energyColor, favouriteType } from '../lib/energy'
import { burst } from '../lib/fx'
import { buzz } from '../lib/haptics'
import { showMoment } from '../lib/moments'
import { useMotion } from '../lib/motion'
import { ownedDexIds } from '../lib/runner'
import {
  ROCKET_GOAL,
  addRocketBlast,
  between,
  fallingHead,
  hitsFallingStar,
  makeFallingStar,
  makeStars,
  pickFlyer,
  previewSky,
  skyPhase,
  starStrength,
  twinkle,
  type FallingStar,
  type SkyPhase,
  type Star,
} from '../lib/sky'

/**
 * Levende achtergrond (DESIGN.md §9). Alles staat achter de panelen en kaarten; tikken op een vallende ster
 * of de Team Rocket-ballon werkt op lege plekken (de klik wordt op positie herkend, er ligt niets over de inhoud).
 * Volgt de instelling Animations: uit = alleen een stille sterrenhemel.
 */

const FPS = 30
const ARTWORK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
/** Hier tik je op iets anders dan de lucht. */
const NOT_SKY =
  'button, a, input, select, textarea, label, summary, dialog, [role="dialog"], [role="button"], .panel, .tile, .stat, .catalog-hit, .set-row, .scan-row, .sidebar, .tab-bar, .mobile-bar, .notice, .camera, .hero'

interface Rocket {
  id: number
  fromLeft: boolean
  top: number
  /** Bij wegschieten: vaste plek waar hij was. */
  blastAt: { x: number; y: number } | null
}

interface Flyer {
  id: number
  dexId: number
  fromLeft: boolean
  top: number
}

interface Gengar {
  id: number
  side: 'left' | 'right'
  top: number
  fleeing: boolean
}

interface Note {
  id: number
  text: string
  x: number
  y: number
}

let seq = 0

function RocketBalloon(): JSX.Element {
  return (
    <svg viewBox="0 0 120 170" width="96" height="136" aria-hidden="true">
      {/* Meowth-ballon */}
      <path d="M22 38 L30 6 L48 26 Z" fill="#e9d8b4" stroke="#6b5233" strokeWidth="2" />
      <path d="M98 38 L90 6 L72 26 Z" fill="#e9d8b4" stroke="#6b5233" strokeWidth="2" />
      <path d="M28 32 L32 14 L42 26 Z" fill="#3b2a24" />
      <path d="M92 32 L88 14 L78 26 Z" fill="#3b2a24" />
      <ellipse cx="60" cy="58" rx="46" ry="42" fill="#f1e3c3" stroke="#6b5233" strokeWidth="2" />
      <circle cx="60" cy="30" r="8" fill="#f4c542" stroke="#9a7417" strokeWidth="2" />
      <ellipse cx="44" cy="56" rx="7" ry="10" fill="#fff" stroke="#3b2a24" strokeWidth="2" />
      <ellipse cx="76" cy="56" rx="7" ry="10" fill="#fff" stroke="#3b2a24" strokeWidth="2" />
      <ellipse cx="45" cy="58" rx="2.5" ry="6" fill="#3b2a24" />
      <ellipse cx="75" cy="58" rx="2.5" ry="6" fill="#3b2a24" />
      <path d="M48 76 Q60 84 72 76" fill="none" stroke="#3b2a24" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 66 L40 70 M18 74 L40 74 M100 66 L80 70 M102 74 L80 74" stroke="#3b2a24" strokeWidth="1.5" />
      {/* Touwen en mand met de R */}
      <path d="M30 92 L44 132 M90 92 L76 132 M60 100 L60 132" stroke="#6b5233" strokeWidth="1.5" />
      <rect x="40" y="130" width="40" height="30" rx="4" fill="#8a5a2b" stroke="#4d3016" strokeWidth="2" />
      <path d="M40 140 H80 M40 150 H80" stroke="#4d3016" strokeWidth="1" />
      <text x="60" y="152" textAnchor="middle" fontSize="20" fontWeight="900" fill="#d6303a" fontFamily="sans-serif">
        R
      </text>
    </svg>
  )
}

function GengarPeek(): JSX.Element {
  return (
    <svg viewBox="0 0 120 90" width="120" height="90" aria-hidden="true">
      <path d="M10 90 C10 40 30 18 60 18 C90 18 110 40 110 90 Z M22 34 L14 8 L36 24 Z M98 34 L106 8 L84 24 Z M50 18 L56 4 L62 18 Z" fill="#5b4590" />
      <path d="M34 46 L52 52 L36 58 Z" fill="#ff4d6d" />
      <path d="M86 46 L68 52 L84 58 Z" fill="#ff4d6d" />
      <path d="M32 66 Q60 86 88 66 Q60 76 32 66 Z" fill="#fff" />
      <path d="M40 69 L44 74 M52 72 L54 78 M66 72 L64 78 M78 69 L74 74" stroke="#5b4590" strokeWidth="2" />
    </svg>
  )
}

/** Kleur voor de gloed: het type dat je het meest verzamelt, anders de typekleur van de pagina. */
function auroraColor(): string {
  const t = favouriteType()
  return t ? energyColor(t) : 'var(--type)'
}

export function Sky({ theme }: { theme: 'dark' | 'light' }): JSX.Element {
  const motion = useMotion()
  const preview = previewSky()
  const [phase, setPhase] = useState<SkyPhase>(() => preview?.phase ?? skyPhase(new Date()))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallingRef = useRef<FallingStar | null>(null)
  const rocketRef = useRef<HTMLDivElement>(null)
  const [rocket, setRocket] = useState<Rocket | null>(null)
  const [flyer, setFlyer] = useState<Flyer | null>(null)
  const [gengar, setGengar] = useState<Gengar | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [aurora] = useState(auroraColor)

  // Fase van de dag elke minuut bijwerken.
  useEffect(() => {
    if (preview?.phase) return
    const timer = window.setInterval(() => setPhase(skyPhase(new Date())), 60_000)
    return () => window.clearInterval(timer)
  }, [preview?.phase])

  // Sterren (en in het lichte thema wolken) tekenen, plus de vallende ster.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let stars: Star[] = []
    let clouds: { x: number; y: number; s: number; v: number }[] = []
    let raf = 0
    let last = 0
    const strength = starStrength(phase, theme)
    const cloudy = theme === 'light' && phase !== 'night'

    const resize = (): void => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = makeStars(canvas.width, canvas.height)
      clouds = Array.from({ length: Math.max(3, Math.round(canvas.width / 450)) }, () => ({
        x: Math.random() * canvas.width,
        y: 30 + Math.random() * canvas.height * 0.45,
        s: 0.6 + Math.random() * 0.9,
        v: 4 + Math.random() * 8,
      }))
    }

    const drawCloud = (x: number, y: number, s: number): void => {
      // Zacht blauwgrijs: wit valt weg tegen de lichte achtergrond.
      ctx.fillStyle = 'rgba(160, 185, 225, 0.22)'
      for (const [dx, dy, r] of [[0, 0, 38], [34, -14, 30], [62, 4, 34], [-30, 8, 26], [30, 14, 32]] as const) {
        ctx.beginPath()
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const draw = (now: number): void => {
      const t = now / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (strength > 0) {
        ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#5b6aa8'
        for (const s of stars) {
          ctx.globalAlpha = (motion ? twinkle(s, t) : s.base) * strength
          ctx.fillRect(s.x, s.y, s.size, s.size)
        }
        ctx.globalAlpha = 1
      }
      if (cloudy) {
        for (const c of clouds) {
          if (motion) c.x = ((c.x + (c.v * (now - last)) / 1000 + 200) % (canvas.width + 400)) - 200
          drawCloud(c.x, c.y, c.s)
        }
      }
      const f = fallingRef.current
      const head = f ? fallingHead(f, now) : null
      if (f && head) {
        const tail = 0.28
        const tx = head.x - f.dx * tail
        const ty = head.y - f.dy * tail
        const fade = head.progress > 0.8 ? (1 - head.progress) / 0.2 : 1
        const color = theme === 'dark' ? '255, 244, 200' : '214, 160, 0'
        const g = ctx.createLinearGradient(tx, ty, head.x, head.y)
        g.addColorStop(0, `rgba(${color}, 0)`)
        g.addColorStop(1, `rgba(${color}, ${0.95 * fade})`)
        ctx.strokeStyle = g
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(head.x, head.y)
        ctx.stroke()
        ctx.fillStyle = `rgba(${color}, ${fade})`
        ctx.beginPath()
        ctx.arc(head.x, head.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      last = now
    }

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      draw(now)
    }
    const start = (): void => {
      cancelAnimationFrame(raf)
      if (!motion) {
        draw(0)
        return
      }
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const onVisibility = (): void => {
      if (document.hidden) cancelAnimationFrame(raf)
      else start()
    }
    const onResize = (): void => {
      resize()
      if (!motion) draw(0)
    }
    resize()
    start()
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [motion, theme, phase])

  // Gebeurtenissen inplannen: vallende ster, Team Rocket, vliegende Pokémon, Gengar ('s nachts).
  useEffect(() => {
    if (!motion) return
    const timers: number[] = []
    const later = (ms: number, fn: () => void): void => {
      timers.push(window.setTimeout(fn, ms))
    }
    const star = (): void => {
      if (!document.hidden) fallingRef.current = makeFallingStar(window.innerWidth, window.innerHeight, performance.now())
      later(between(20, 60), star)
    }
    // Preview: één trage ster in het midden, om te kunnen bekijken en aantikken.
    const slowStar = (): void => {
      fallingRef.current = { x0: window.innerWidth * 0.85, y0: window.innerHeight * 0.02, dx: -window.innerWidth * 0.4, dy: window.innerHeight * 0.08, start: performance.now(), duration: 8000 }
    }
    const rocketLater = (ms: number): void =>
      later(ms, () => {
        if (!document.hidden) setRocket({ id: ++seq, fromLeft: Math.random() < 0.5, top: 6 + Math.random() * 26, blastAt: null })
        rocketLater(between(240, 420))
      })
    const flyerLater = (ms: number): void =>
      later(ms, () => {
        if (!document.hidden) setFlyer({ id: ++seq, dexId: pickFlyer(ownedDexIds()), fromLeft: Math.random() < 0.5, top: 12 + Math.random() * 40 })
        flyerLater(between(150, 300))
      })
    const gengarLater = (ms: number): void =>
      later(ms, () => {
        if (!document.hidden && (phase === 'night' || preview?.kind === 'gengar')) {
          setGengar({ id: ++seq, side: Math.random() < 0.5 ? 'left' : 'right', top: 55 + Math.random() * 25, fleeing: false })
        }
        gengarLater(between(180, 300))
      })

    const kind = preview?.kind
    if (kind === 'star') later(300, slowStar)
    later(between(8, 30), star)
    rocketLater(kind === 'rocket' ? 300 : between(60, 150))
    flyerLater(kind === 'flyer' ? 300 : between(90, 200))
    gengarLater(kind === 'gengar' ? 300 : between(40, 120))
    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [motion, phase, preview?.kind])

  // Gengar verdwijnt na een paar seconden, of meteen als je in de buurt komt.
  useEffect(() => {
    if (!gengar || gengar.fleeing) return
    const flee = (): void => setGengar((g) => (g ? { ...g, fleeing: true } : g))
    const timer = window.setTimeout(flee, 6000)
    const onMove = (e: PointerEvent): void => {
      const x = gengar.side === 'left' ? 0 : window.innerWidth
      const y = (gengar.top / 100) * window.innerHeight
      if (e.pointerType !== 'mouse' || Math.hypot(e.clientX - x, e.clientY - y) < 180) flee()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', flee)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', flee)
    }
  }, [gengar])

  // Tekstje kort tonen.
  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), 2800)
    return () => window.clearTimeout(timer)
  }, [note])

  // Tikken op een lege plek: Team Rocket of de vallende ster geraakt?
  useEffect(() => {
    if (!motion) return
    const onClick = (e: MouseEvent): void => {
      if (e.defaultPrevented || !(e.target instanceof Element) || e.target.closest(NOT_SKY)) return
      const { clientX: x, clientY: y } = e
      const balloon = rocketRef.current?.getBoundingClientRect()
      if (balloon && x >= balloon.left - 16 && x <= balloon.right + 16 && y >= balloon.top - 16 && y <= balloon.bottom + 16) {
        setRocket((r) => (r && !r.blastAt ? { ...r, blastAt: { x: balloon.left, y: balloon.top } } : r))
        const total = addRocketBlast()
        burst(x, y, { colors: ['#ffffff', 'var(--yellow)', '#d6303a'], count: 26, speed: 7 })
        buzz([20, 40, 20])
        setNote({ id: ++seq, text: "Team Rocket's blasting off again!", x, y })
        if (total === ROCKET_GOAL) celebrateSecret('rocket')
        return
      }
      const f = fallingRef.current
      if (f && hitsFallingStar(f, x, y, performance.now())) {
        fallingRef.current = null
        burst(x, y, { colors: ['#fff4c8', 'var(--yellow)', '#ffffff'], count: 30, speed: 6 })
        buzz(20)
        makeWish()
          .then((r) => {
            if (r === null) setNote({ id: ++seq, text: 'You caught a falling star! (Wishes need STAP13.)', x, y })
            else if (r.gained > 0) {
              setNote({ id: ++seq, text: 'You made a wish! ✦', x, y })
              showMoment({ kind: 'points', amount: r.gained, reason: 'Wish on a falling star' })
            } else setNote({ id: ++seq, text: 'One wish a day. Come back tomorrow ✦', x, y })
          })
          .catch((err: unknown) => {
            console.warn('Wens mislukt', err)
            setNote({ id: ++seq, text: 'Your wish got lost. Try the next star.', x, y })
          })
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [motion])

  return (
    <>
      <div className={`sky sky-${theme}`} data-phase={phase} aria-hidden="true" style={{ '--aurora': aurora } as CSSProperties}>
        <div className="sky-tint" />
        <div className="sky-aurora" />
        <canvas ref={canvasRef} className="sky-canvas" />
        {motion && flyer && (
          <img
            key={flyer.id}
            className={`sky-flyer${flyer.fromLeft ? ' from-left' : ''}`}
            src={`${ARTWORK}/${flyer.dexId}.png`}
            alt=""
            style={{ top: `${flyer.top}%` }}
            onAnimationEnd={() => setFlyer(null)}
            onError={() => setFlyer(null)}
          />
        )}
        {motion && rocket && (
          <div
            key={rocket.id}
            ref={rocketRef}
            className={`sky-rocket${rocket.fromLeft ? ' from-left' : ''}${rocket.blastAt ? ' blast' : ''}`}
            style={rocket.blastAt ? { left: rocket.blastAt.x, top: rocket.blastAt.y } : { top: `${rocket.top}%` }}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setRocket(null)
            }}
          >
            <span className="sky-rocket-bob">
              <RocketBalloon />
            </span>
          </div>
        )}
      </div>
      {motion && gengar && (
        <div
          key={gengar.id}
          className={`sky-gengar ${gengar.side}${gengar.fleeing ? ' flee' : ''}`}
          style={{ top: `${gengar.top}%` }}
          aria-hidden="true"
          onAnimationEnd={(e) => {
            if (gengar.fleeing && e.target === e.currentTarget) setGengar(null)
          }}
        >
          <GengarPeek />
        </div>
      )}
      {note && (
        <p key={note.id} className="sky-note" role="status" style={{ left: note.x, top: note.y }}>
          {note.text}
        </p>
      )}
    </>
  )
}
