import { Fragment, useEffect, useMemo, useState, type JSX } from 'react'
import { evolutionLines, getEvolutionPaths, type EvolutionLine } from '../lib/evolution'
import { celebrateEvolutions } from '../lib/moments'
import { spriteUrls } from '../lib/runner'

const MAX_SHOWN = 6

/** Evolutielijn als rij sprites met pijltjes; ontbrekende stadia als silhouet. */
export function EvolutionRow({ line, owned }: { line: Pick<EvolutionLine, 'path'>; owned: ReadonlySet<number> }): JSX.Element {
  return (
    <span className="evo-row">
      {line.path.map((d, i) => (
        <Fragment key={d}>
          {i > 0 && (
            <span className="evo-arrow" aria-hidden="true">
              ›
            </span>
          )}
          <img className={owned.has(d) ? 'evo-mon' : 'evo-mon is-missing'} src={spriteUrls(d, false)[1]} alt={`#${d}${owned.has(d) ? '' : ' (missing)'}`} width={56} height={56} loading="lazy" />
        </Fragment>
      ))}
    </span>
  )
}

/** Evolutielijnen in je collectie: complete lijnen, en lijnen waar nog weinig aan ontbreekt. */
export function EvolutionPanel({ owned }: { owned: ReadonlySet<number> }): JSX.Element | null {
  const [paths, setPaths] = useState<ReadonlyMap<number, number[][]>>(new Map())
  const key = [...owned].sort((a, b) => a - b).join(',')
  // Nog niet voor elke Pokémon de evolutie binnen.
  const loading = [...owned].some((d) => !paths.has(d))

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const ids = key.split(',').map(Number)
    const found = new Map<number, number[][]>()
    let done = 0
    for (const id of ids) {
      void getEvolutionPaths(id).then((p) => {
        found.set(id, p)
        done += 1
        if (!cancelled && (done % 10 === 0 || done === ids.length)) setPaths(new Map(found))
      })
    }
    return () => {
      cancelled = true
    }
  }, [key])

  const lines = useMemo(() => evolutionLines(owned, paths), [owned, paths])
  const complete = lines.filter((l) => l.complete)
  const almost = lines.filter((l) => !l.complete && l.path.length - l.owned === 1)

  // Nieuwe complete lijn vieren, pas als alles geladen is.
  const completeKey = complete.map((l) => l.path.join('>')).join('|')
  useEffect(() => {
    if (loading || paths.size === 0) return
    celebrateEvolutions(completeKey ? completeKey.split('|').map((k) => k.split('>').map(Number)) : [])
  }, [completeKey, loading, paths.size])

  if (owned.size === 0) return null
  return (
    <section className="panel evolutions" aria-labelledby="evo-title">
      <h2 id="evo-title" className="panel-title">
        Evolution lines
      </h2>
      <p className="flavor">
        {complete.length} complete{almost.length > 0 ? `, ${almost.length} one Pokémon away` : ''}
      </p>
      {loading && lines.length === 0 && <p className="muted small">Looking up evolutions…</p>}
      {!loading && lines.length === 0 && <p className="muted small">None of your Pokémon evolve yet. Add a Pokémon and its evolution to start a line.</p>}
      <ul className="evo-list">
        {[...complete, ...almost].slice(0, MAX_SHOWN).map((l) => (
          <li key={l.path.join('>')} className={l.complete ? 'is-complete' : ''}>
            <EvolutionRow line={l} owned={owned} />
            <span className="small">{l.complete ? 'Complete' : 'One to go'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
