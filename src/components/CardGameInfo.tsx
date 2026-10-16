import type { JSX } from 'react'
import { stageLabel, type CardGame } from '../lib/cardGame'
import type { EnergyType } from '../lib/cardTraits'
import { energyColor } from '../lib/energy'
import { EnergyIcon } from './RaritySymbols'

function Energy({ type }: { type: EnergyType }): JSX.Element {
  return (
    <span className="energy-dot" style={{ background: energyColor(type) }} title={type}>
      <EnergyIcon type={type} size={12} />
      <span className="visually-hidden">{type}</span>
    </span>
  )
}

/** De kaart zoals in het spel: HP, stadium, vaardigheden, aanvallen, zwakte en terugtrekken. */
export function CardGameInfo({ game, illustrator }: { game: CardGame; illustrator: string | null }): JSX.Element {
  const isPokemon = game.category === 'Pokemon'
  return (
    <div className="game-info">
      {isPokemon && (
        <div className="game-head">
          {game.stage && <span className="chip">{stageLabel(game.stage)}</span>}
          {game.evolveFrom && <span className="muted small">Evolves from {game.evolveFrom}</span>}
          {game.hp !== null && (
            <span className="game-hp">
              <span className="small">HP</span>
              {game.hp}
            </span>
          )}
        </div>
      )}
      {!isPokemon && (game.trainerType || game.category) && <span className="chip">{game.trainerType ?? game.category}</span>}

      {game.abilities.map((a) => (
        <div key={a.name} className="game-ability">
          <span className="game-ability-tag">{a.type}</span>
          <strong>{a.name}</strong>
          {a.effect && <p className="small">{a.effect}</p>}
        </div>
      ))}

      {game.attacks.length > 0 && (
        <ul className="game-attacks">
          {game.attacks.map((a) => (
            <li key={a.name}>
              <span className="game-cost" aria-label={a.cost.length ? `Cost: ${a.cost.join(', ')}` : 'No cost'}>
                {a.cost.map((t, i) => (
                  <Energy key={i} type={t} />
                ))}
              </span>
              <strong className="game-attack-name">{a.name}</strong>
              {a.damage && <span className="game-damage">{a.damage}</span>}
              {a.effect && <p className="small game-effect">{a.effect}</p>}
            </li>
          ))}
        </ul>
      )}

      {game.effect && <p className="game-text">{game.effect}</p>}

      {isPokemon && (
        <dl className="game-stats">
          <div>
            <dt>Weakness</dt>
            <dd>
              {game.weaknesses.length > 0
                ? game.weaknesses.map((w) => (
                    <span key={w.type} className="game-stat">
                      <Energy type={w.type} /> {w.value}
                    </span>
                  ))
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Resistance</dt>
            <dd>
              {game.resistances.length > 0
                ? game.resistances.map((w) => (
                    <span key={w.type} className="game-stat">
                      <Energy type={w.type} /> {w.value}
                    </span>
                  ))
                : '–'}
            </dd>
          </div>
          <div>
            <dt>Retreat</dt>
            <dd>
              {game.retreat
                ? Array.from({ length: game.retreat }, (_, i) => <Energy key={i} type="Colorless" />)
                : game.retreat === 0
                  ? 'Free'
                  : '–'}
            </dd>
          </div>
        </dl>
      )}

      {game.description && <p className="game-flavor">{game.description}</p>}
      {illustrator && <p className="muted small">Illustrated by {illustrator}</p>}
    </div>
  )
}
