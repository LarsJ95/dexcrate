import { useEffect, useRef, type RefObject } from 'react'
import { buzz } from './haptics'

/** Wat nodig is om kaartregels in je eigen volgorde te zetten. */
export interface Ordered {
  id: string
  sort_order: number
  created_at: string
}

/** Vaste volgorde (oud → nieuw): sort_order, bij gelijke waarde wie eerst is toegevoegd. */
export function compareOrder(a: Ordered, b: Ordered): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
}

/**
 * Twee kaarten van plek wisselen in de volgorde van álle kaarten.
 * Hergebruikt de bestaande sort_order-waarden, zodat normaal alleen die twee regels veranderen;
 * gelijke waarden worden eerst uit elkaar getrokken. Geeft id → nieuwe sort_order van wat verandert.
 */
export function swapOrder(all: readonly Ordered[], a: string, b: string): Map<string, number> {
  const order = [...all].sort(compareOrder)
  const i = order.findIndex((c) => c.id === a)
  const j = order.findIndex((c) => c.id === b)
  const changes = new Map<string, number>()
  if (i < 0 || j < 0 || i === j) return changes
  const values = order.map((c) => c.sort_order)
  for (let k = 1; k < values.length; k++) {
    if (values[k] <= values[k - 1]) values[k] = values[k - 1] + 1
  }
  ;[order[i], order[j]] = [order[j], order[i]]
  order.forEach((c, k) => {
    if (c.sort_order !== values[k]) changes.set(c.id, values[k])
  })
  return changes
}

const HOLD_MS = 350
const MOVE_PX = 8
const EDGE_PX = 70
const SCROLL_STEP = 14

interface DragState {
  id: string
  el: HTMLElement
  pointerId: number
  mouse: boolean
  x0: number
  y0: number
  scroll0: number
  x: number
  y: number
  active: boolean
  timer: number | null
  target: HTMLElement | null
}

function tileOf(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>('[data-drag-id]') : null
}

/**
 * Kaarten in een lijst verslepen: loslaten op een andere kaart = van plek wisselen.
 * Muis: direct slepen. Touch: eerst even vasthouden (anders scroll je). Toetsenbord: Alt + pijl links/rechts.
 * Elk sleepbaar element heeft `data-drag-id`.
 */
export function useDragSwap(listRef: RefObject<HTMLElement | null>, enabled: boolean, onSwap: (fromId: string, toId: string) => void): void {
  const swapRef = useRef(onSwap)
  useEffect(() => {
    swapRef.current = onSwap
  }, [onSwap])

  useEffect(() => {
    const list = listRef.current
    if (!enabled || !list) return
    let state: DragState | null = null
    let suppressClick = false
    let raf = 0

    const setTarget = (next: HTMLElement | null): void => {
      if (!state || state.target === next) return
      state.target?.classList.remove('is-drop-target')
      next?.classList.add('is-drop-target')
      state.target = next
    }

    const follow = (): void => {
      if (!state?.active) return
      const dy = state.y - state.y0 + (window.scrollY - state.scroll0)
      state.el.style.transform = `translate(${state.x - state.x0}px, ${dy}px)`
      const over = tileOf(document.elementFromPoint(state.x, state.y))
      setTarget(over && over !== state.el && list.contains(over) ? over : null)
    }

    // Automatisch scrollen bij de rand van het scherm, zodat je ver weg kunt neerzetten.
    const autoScroll = (): void => {
      if (!state?.active) return
      const step = state.y < EDGE_PX ? -SCROLL_STEP : state.y > window.innerHeight - EDGE_PX ? SCROLL_STEP : 0
      if (step !== 0) {
        window.scrollBy(0, step)
        follow()
      }
      raf = requestAnimationFrame(autoScroll)
    }

    const begin = (): void => {
      if (!state) return
      state.timer = null
      state.active = true
      state.el.classList.add('is-dragging')
      list.classList.add('is-sorting')
      if (!state.mouse) buzz(10)
      follow()
      raf = requestAnimationFrame(autoScroll)
    }

    const finish = (commit: boolean): void => {
      if (!state) return
      const s = state
      if (s.timer !== null) window.clearTimeout(s.timer)
      cancelAnimationFrame(raf)
      if (s.active) {
        s.el.classList.remove('is-dragging')
        s.el.style.transform = ''
        list.classList.remove('is-sorting')
        s.target?.classList.remove('is-drop-target')
        suppressClick = true
        window.setTimeout(() => {
          suppressClick = false
        }, 0)
        const toId = s.target?.dataset.dragId
        if (commit && toId) swapRef.current(s.id, toId)
      }
      state = null
    }

    const onDown = (e: PointerEvent): void => {
      if (state || (e.pointerType === 'mouse' && e.button !== 0)) return
      const tile = tileOf(e.target)
      const id = tile?.dataset.dragId
      if (!tile || !id) return
      // Knoppen in de kaart (bv. "Mark as sold") niet als sleepgreep gebruiken; de kaartfoto wel.
      const control = e.target instanceof Element ? e.target.closest('button, a, input, select, textarea') : null
      if (control && !control.classList.contains('tile-open')) return
      const mouse = e.pointerType === 'mouse'
      state = { id, el: tile, pointerId: e.pointerId, mouse, x0: e.clientX, y0: e.clientY, scroll0: window.scrollY, x: e.clientX, y: e.clientY, active: false, timer: null, target: null }
      if (!mouse) state.timer = window.setTimeout(begin, HOLD_MS)
    }

    const onMove = (e: PointerEvent): void => {
      if (!state || e.pointerId !== state.pointerId) return
      state.x = e.clientX
      state.y = e.clientY
      if (state.active) {
        e.preventDefault()
        follow()
        return
      }
      if (Math.hypot(e.clientX - state.x0, e.clientY - state.y0) <= MOVE_PX) return
      if (state.mouse) begin()
      else finish(false) // vinger bewoog vóór het vasthouden: dat is scrollen
    }

    const onUp = (e: PointerEvent): void => {
      if (state && e.pointerId === state.pointerId) finish(true)
    }
    const onCancel = (e: PointerEvent): void => {
      if (state && e.pointerId === state.pointerId) finish(false)
    }
    // Tijdens slepen op touch niet scrollen.
    const onTouchMove = (e: TouchEvent): void => {
      if (state?.active) e.preventDefault()
    }
    // Lang indrukken opent op Android anders het contextmenu van de afbeelding.
    const onContextMenu = (e: Event): void => {
      if (state && !state.mouse) e.preventDefault()
    }
    // Na slepen geen klik (die zou de kaart openen).
    const onClick = (e: MouseEvent): void => {
      if (!suppressClick) return
      suppressClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    // Afbeeldingen niet als bestand meeslepen.
    const onDragStart = (e: DragEvent): void => e.preventDefault()

    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const tile = tileOf(e.target)
      const id = tile?.dataset.dragId
      if (!tile || !id) return
      let other = e.key === 'ArrowLeft' ? tile.previousElementSibling : tile.nextElementSibling
      while (other && !(other instanceof HTMLElement && other.dataset.dragId)) {
        other = e.key === 'ArrowLeft' ? other.previousElementSibling : other.nextElementSibling
      }
      const toId = other instanceof HTMLElement ? other.dataset.dragId : undefined
      if (!toId) return
      e.preventDefault()
      swapRef.current(id, toId)
      // Focus blijft op de verplaatste kaart.
      window.setTimeout(() => list.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"] .tile-open`)?.focus(), 0)
    }

    list.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    list.addEventListener('contextmenu', onContextMenu)
    list.addEventListener('click', onClick, true)
    list.addEventListener('dragstart', onDragStart)
    list.addEventListener('keydown', onKey)
    return () => {
      finish(false)
      list.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', onTouchMove)
      list.removeEventListener('contextmenu', onContextMenu)
      list.removeEventListener('click', onClick, true)
      list.removeEventListener('dragstart', onDragStart)
      list.removeEventListener('keydown', onKey)
    }
  }, [listRef, enabled])
}
