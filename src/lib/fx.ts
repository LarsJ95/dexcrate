import { motionAllowed } from './motion'

/** Vonken en confetti op één canvas over de hele app (DESIGN.md §9). Zonder animaties gebeurt er niets. */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  kind: 'spark' | 'confetti'
  color: string
  size: number
  rot: number
  vr: number
  life: number
  decay: number
}

export interface BurstOptions {
  /** CSS-kleuren; `var(--token)` wordt opgezocht. */
  colors: string[]
  count?: number
  speed?: number
  kind?: Particle['kind']
  gravity?: number
  /** Spreiding in radialen rond `dir` (standaard rondom). */
  spread?: number
  dir?: number
}

const MAX_PARTICLES = 400

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
const parts: Particle[] = []
let running = false

function size(): void {
  if (!canvas || !ctx) return
  const d = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(innerWidth * d)
  canvas.height = Math.round(innerHeight * d)
  ctx.setTransform(d, 0, 0, d, 0, 0)
}

/** Popover zodat de laag ook boven een open dialoog komt (top layer). */
export function raiseToTop(el: HTMLElement): void {
  if (typeof el.showPopover !== 'function') return
  try {
    if (el.matches(':popover-open')) el.hidePopover()
    el.showPopover()
  } catch (err) {
    console.warn('Effectlaag naar voren halen mislukt', err)
  }
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx && canvas) return ctx
  canvas = document.createElement('canvas')
  canvas.className = 'fx-layer'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.setAttribute('popover', 'manual')
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  window.addEventListener('resize', size)
  size()
  return ctx
}

function resolveColor(c: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(c.trim())
  if (!m) return c
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#ffffff'
}

function drawStar(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath()
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.38 : r
    const a = (i * Math.PI) / 4
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  c.closePath()
  c.fill()
}

function tick(): void {
  const c = ctx
  if (!c) return
  c.clearRect(0, 0, innerWidth, innerHeight)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    p.vx *= 0.985
    p.vy = p.vy * 0.985 + p.g
    p.x += p.vx
    p.y += p.vy
    p.rot += p.vr
    p.life -= p.decay
    if (p.life <= 0 || p.y > innerHeight + 30) {
      parts.splice(i, 1)
      continue
    }
    c.globalAlpha = Math.min(1, p.life * 1.4)
    c.fillStyle = p.color
    if (p.kind === 'confetti') {
      c.save()
      c.translate(p.x, p.y)
      c.rotate(p.rot)
      c.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * (0.4 + Math.abs(Math.sin(p.rot * 2))))
      c.restore()
    } else {
      drawStar(c, p.x, p.y, p.size * 1.6)
    }
  }
  c.globalAlpha = 1
  if (parts.length > 0) requestAnimationFrame(tick)
  else {
    running = false
    c.clearRect(0, 0, innerWidth, innerHeight)
    if (canvas?.matches(':popover-open')) canvas.hidePopover()
  }
}

export function burst(x: number, y: number, opts: BurstOptions): void {
  if (!motionAllowed()) return
  const c = ensureCanvas()
  if (!c || !canvas) return
  const { count = 30, speed = 7, kind = 'spark', gravity = 0.15, spread = Math.PI * 2, dir = -Math.PI / 2 } = opts
  const colors = opts.colors.map(resolveColor)
  for (let i = 0; i < count && parts.length < MAX_PARTICLES; i++) {
    const a = dir + (Math.random() - 0.5) * spread
    const v = speed * (0.35 + Math.random() * 0.75)
    parts.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      g: gravity,
      kind,
      color: colors[i % colors.length],
      size: kind === 'confetti' ? 5 + Math.random() * 5 : 2 + Math.random() * 3,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      life: 1,
      decay: kind === 'confetti' ? 0.006 : 0.02 + Math.random() * 0.015,
    })
  }
  raiseToTop(canvas)
  if (!running) {
    running = true
    requestAnimationFrame(tick)
  }
}

/** Vonken vanuit het midden van een element. */
export function burstFrom(el: Element, opts: BurstOptions): void {
  const r = el.getBoundingClientRect()
  burst(r.left + r.width / 2, r.top + r.height / 2, opts)
}

/** Confetti vanaf beide zijkanten. */
export function confetti(colors: string[]): void {
  const y = innerHeight * 0.35
  burst(innerWidth * 0.08, y, { colors, count: 70, speed: 13, kind: 'confetti', gravity: 0.22, spread: 0.9, dir: -Math.PI / 3 })
  burst(innerWidth * 0.92, y, { colors, count: 70, speed: 13, kind: 'confetti', gravity: 0.22, spread: 0.9, dir: (-2 * Math.PI) / 3 })
}
