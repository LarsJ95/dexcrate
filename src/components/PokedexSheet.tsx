import { useState, type JSX } from 'react'
import { spriteUrls } from '../lib/runner'
import { REGIONS, generationRange } from '../lib/trainer'
import { Sheet } from './Sheet'

export interface DexEntry {
  /** Jouw kaarten van deze Pokémon (id en naam). */
  cards: { id: string; name: string }[]
}

interface Props {
  gen: number
  /** Pokédex-nummer → jouw kaarten van die Pokémon. */
  caught: ReadonlyMap<number, DexEntry>
  onClose: () => void
  onOpenCard: (id: string) => void
}

const pad = (n: number): string => String(n).padStart(4, '0')

/** Pokédex-raster van één regio: gevangen Pokémon in kleur, de rest als silhouet. */
export function PokedexSheet({ gen, caught, onClose, onOpenCard }: Props): JSX.Element {
  const { first, last } = generationRange(gen)
  const [selected, setSelected] = useState<number | null>(null)
  const ids = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const count = ids.filter((d) => caught.has(d)).length
  const entry = selected !== null ? caught.get(selected) : undefined
  return (
    <Sheet title={`${REGIONS[gen - 1]} Pokédex: ${count} of ${ids.length}`} onClose={onClose}>
      <p className="muted small">Generation {gen}, #{first} to #{last}. Pokémon you own cards of are shown in colour; tap one to see your cards.</p>
      {entry && selected !== null && (
        <div className="dex-detail" role="status">
          <img src={spriteUrls(selected, false)[1]} alt="" width={64} height={64} />
          <div>
            <strong>#{pad(selected)}</strong>
            <ul>
              {entry.cards.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onClose()
                      onOpenCard(c.id)
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ol className="dex-grid">
        {ids.map((d) => {
          const have = caught.has(d)
          return (
            <li key={d}>
              {have ? (
                <button type="button" className={`dex-cell is-caught${selected === d ? ' is-selected' : ''}`} onClick={() => setSelected(d)} aria-label={`#${d}: ${caught.get(d)?.cards[0]?.name ?? ''}`}>
                  <img src={spriteUrls(d, false)[1]} alt="" loading="lazy" width={64} height={64} />
                  <span className="dex-num">{pad(d)}</span>
                </button>
              ) : (
                <span className="dex-cell" title={`#${d}: not caught yet`}>
                  <img src={spriteUrls(d, false)[1]} alt="" loading="lazy" width={64} height={64} />
                  <span className="dex-num">{pad(d)}</span>
                  <span className="visually-hidden">#{d}, not caught yet</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}
