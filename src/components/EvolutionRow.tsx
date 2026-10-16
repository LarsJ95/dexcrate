import { Fragment, type JSX } from 'react'
import type { EvolutionLine } from '../lib/evolution'
import { spriteUrls } from '../lib/runner'

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
