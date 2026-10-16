import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { energyColor } from '../lib/energy'
import { burstFrom } from '../lib/fx'
import { motionAllowed, useMotion } from '../lib/motion'
import { SHINY_CHANCE, pickRunner, previewRunnerDelay, spriteUrls, type RunnerEntry } from '../lib/runner'
import { busy, loadSprite } from '../lib/sprites'

interface Run {
  entry: RunnerEntry
  shiny: boolean
  src: string
  /** Stilstaande sprite (96 px) niet vergroten; bewegende (klein) wel. */
  scale: number
  width: number
  height: number
  ms: number
}

interface Props {
  /** Op Scan nooit langsrennen. */
  paused: boolean
  /** Eerste keer na (ms; standaard 45 tot 90 s); daarna elke 3 tot 6 minuten (DESIGN.md §9). */
  firstDelay?: number
}

const NEXT_MIN = 3 * 60_000
const NEXT_SPREAD = 3 * 60_000
const RETRY = 30_000

/** Af en toe rent een Pokémon uit je collectie onderlangs; tikken laat hem springen. */
export function Runner({ paused, firstDelay }: Props): JSX.Element | null {
  const motion = useMotion()
  const [run, setRun] = useState<Run | null>(null)
  const [jump, setJump] = useState(0)
  const [say, setSay] = useState<string | null>(null)
  const pausedRef = useRef(paused)
  const ref = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const firstDelayRef = useRef(firstDelay)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!motion) return
    let cancelled = false
    const schedule = (ms: number): void => {
      timer.current = window.setTimeout(() => void attempt(), ms)
    }
    const attempt = async (): Promise<void> => {
      if (cancelled) return
      if (!motionAllowed() || pausedRef.current || busy()) return schedule(RETRY)
      const entry = pickRunner()
      if (!entry) return schedule(NEXT_MIN)
      const shiny = Math.random() < SHINY_CHANCE
      const sprite = await loadSprite(spriteUrls(entry.dexId, shiny))
      if (cancelled) return
      if (!sprite) return schedule(NEXT_MIN)
      const scale = sprite.animated ? 2 : 1
      setRun({ entry, shiny, src: sprite.src, scale, width: sprite.width * scale, height: sprite.height * scale, ms: 6500 + Math.random() * 2500 })
    }
    schedule(firstDelayRef.current ?? previewRunnerDelay() ?? 45_000 + Math.random() * 45_000)
    // Na een run: volgende inplannen (via onAnimationEnd hieronder).
    const onDone = (): void => schedule(NEXT_MIN + Math.random() * NEXT_SPREAD)
    window.addEventListener('dexcrate:runner-done', onDone)
    return () => {
      cancelled = true
      if (timer.current !== null) clearTimeout(timer.current)
      window.removeEventListener('dexcrate:runner-done', onDone)
    }
  }, [motion])

  useEffect(() => {
    if (!say) return
    const t = window.setTimeout(() => setSay(null), 1300)
    return () => clearTimeout(t)
  }, [say])

  if (!motion || !run) return null

  const { entry, shiny } = run
  const cry = entry.dexId === 25 ? 'Pika!' : `${entry.name}!`
  const style = { '--run-ms': `${run.ms}ms` } as CSSProperties

  return (
    <button
      ref={ref}
      type="button"
      className="runner"
      style={style}
      tabIndex={-1}
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.animationName !== 'runner-run') return
        setRun(null)
        window.dispatchEvent(new Event('dexcrate:runner-done'))
      }}
      onClick={() => {
        setJump((n) => n + 1)
        setSay(shiny ? `Shiny ${entry.name}!` : cry)
        if (ref.current) {
          burstFrom(ref.current, {
            colors: shiny ? ['var(--gold-a)', 'var(--gold-b)', '#ffffff'] : [entry.type ? energyColor(entry.type) : 'var(--yellow)', '#ffffff'],
            count: shiny ? 28 : 16,
            speed: 5,
            gravity: 0.1,
          })
        }
      }}
    >
      {say && <span className="runner-bubble">{say}</span>}
      <span key={jump} className={`runner-hop${jump > 0 ? ' is-jump' : ''}`}>
        <img src={run.src} alt="" width={run.width} height={run.height} draggable={false} />
        <span className="runner-shadow" />
      </span>
    </button>
  )
}
