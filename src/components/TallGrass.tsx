import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { motionAllowed, useMotion } from '../lib/motion'
import { englishSpeciesName } from '../lib/names'
import { SHINY_CHANCE, ownedDexIds, pickEncounter, spriteUrls } from '../lib/runner'
import { busy, previewGrassDelay } from '../lib/sprites'
import { WISHLIST_QUERY_KEY } from '../lib/wishFilters'
import { Sheet } from './Sheet'

const NEXT_MIN = 2 * 60_000
const NEXT_SPREAD = 2 * 60_000
const RETRY = 30_000
/** Zo lang ritselt het gras voordat het weer stil wordt. */
const RUSTLE_MS = 9000

interface Encounter {
  dex: number
  name: string
  shiny: boolean
}

/** Hoog gras onderaan: af en toe ritselt het; tik erop voor een wilde Pokémon. */
export function TallGrass({ paused }: { paused: boolean }): JSX.Element | null {
  const motion = useMotion()
  const [rustle, setRustle] = useState<{ x: number; id: number } | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [loading, setLoading] = useState(false)
  // Elke afgeronde ontmoeting start een nieuwe ronde (nieuw ritme in het effect hieronder).
  const [round, setRound] = useState(0)
  const pausedRef = useRef(paused)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!motion) return
    let cancelled = false
    const schedule = (ms: number): void => {
      timer.current = window.setTimeout(attempt, ms)
    }
    const attempt = (): void => {
      if (cancelled) return
      if (!motionAllowed() || pausedRef.current || busy()) return schedule(RETRY)
      const id = Date.now()
      setRustle({ x: 10 + Math.random() * 80, id })
      // Niet aangetikt: weer stil, en later opnieuw.
      timer.current = window.setTimeout(() => {
        setRustle((r) => (r?.id === id ? null : r))
        schedule(NEXT_MIN + Math.random() * NEXT_SPREAD)
      }, RUSTLE_MS)
    }
    schedule(round > 0 ? NEXT_MIN + Math.random() * NEXT_SPREAD : (previewGrassDelay() ?? 40_000 + Math.random() * 40_000))
    return () => {
      cancelled = true
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [motion, round])

  async function startEncounter(): Promise<void> {
    if (loading) return
    setLoading(true)
    const dex = pickEncounter(ownedDexIds())
    let name = `#${dex}`
    try {
      name = (await englishSpeciesName(dex)) ?? name
    } catch (err) {
      console.warn('Naam van de wilde Pokémon ophalen mislukt', err)
    }
    setLoading(false)
    setRustle(null)
    if (timer.current !== null) clearTimeout(timer.current)
    setEncounter({ dex, name, shiny: Math.random() < SHINY_CHANCE })
  }

  function endEncounter(): void {
    setEncounter(null)
    setRound((r) => r + 1)
  }

  if (!motion || paused) return null

  return (
    <>
      <div className="tall-grass" aria-hidden={rustle ? undefined : true}>
        {rustle && (
          <>
            <span className="grass-alert" style={{ left: `${rustle.x}%` } as CSSProperties} aria-hidden="true">
              !
            </span>
            <button
              type="button"
              className="grass-rustle"
              style={{ left: `${rustle.x}%` } as CSSProperties}
              onClick={() => void startEncounter()}
              aria-label="Something is moving in the tall grass"
              disabled={loading}
            />
          </>
        )}
      </div>
      {encounter && (
        <Sheet title={`A wild ${encounter.shiny ? 'shiny ' : ''}${encounter.name} appeared!`} onClose={endEncounter}>
          <div className={`battle${encounter.shiny ? ' is-shiny' : ''}`}>
            <span className="battle-platform" aria-hidden="true" />
            <img className="battle-mon" src={spriteUrls(encounter.dex, encounter.shiny)[0]} alt={encounter.name} onError={(e) => (e.currentTarget.src = spriteUrls(encounter.dex, encounter.shiny)[1])} />
          </div>
          <p className="battle-text">What will you do?</p>
          <footer className="sheet-foot">
            <button type="button" className="ghost" onClick={endEncounter}>
              Run
            </button>
            <span className="spacer" />
            <button
              type="button"
              className="primary"
              onClick={() => {
                try {
                  sessionStorage.setItem(WISHLIST_QUERY_KEY, encounter.name)
                } catch (err) {
                  console.warn('Zoekterm doorgeven mislukt', err)
                }
                endEncounter()
                window.location.hash = '#/wishlist'
              }}
            >
              Find {encounter.name} cards
            </button>
          </footer>
        </Sheet>
      )}
    </>
  )
}
