import { useEffect, useMemo, useState, type JSX } from 'react'
import { CRATE_SERVER_MISSING, craftCard, craftCost, hasCrateServer, type CrateRules } from '../lib/crate'
import { errorText } from '../lib/errors'
import { getSet, getSetRarities, type SetCard } from '../lib/tcgdex'
import { CardFace } from './CardFace'
import { CatalogKeyPicture } from './CatalogCardPicture'
import { Loading } from './Loading'
import { RaritySymbols } from './RaritySymbols'
import { Sheet } from './Sheet'

interface Props {
  /** "en/sv03.5" */
  setKey: string
  setName: string
  /** Kaarten in je Crate ("en/sv03.5-025"). */
  owned: ReadonlySet<string>
  rules: CrateRules
  points: number
  /** Nieuwe puntenstand na een aankoop. */
  onBought: (points: number) => void
  onClose: () => void
}

const numberOf = (c: SetCard): number => Number.parseInt(c.localId, 10) || Number.MAX_SAFE_INTEGER

/** Ontbrekende kaarten van een set gericht kopen met Crate points (STAP23; de server bepaalt kaart en prijs). */
export function CrateMissingSheet({ setKey, setName, owned, rules, points, onBought, onClose }: Props): JSX.Element {
  const setId = setKey.slice(setKey.indexOf('/') + 1)
  const [cards, setCards] = useState<(SetCard & { rarity: string | null })[] | null>(null)
  const [server, setServer] = useState<boolean | undefined>(undefined)
  const [bought, setBought] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState(points)

  useEffect(() => {
    let cancelled = false
    Promise.all([getSet('en', setId), getSetRarities('en', setId), hasCrateServer()])
      .then(([set, rarities, ok]) => {
        if (cancelled) return
        setServer(ok)
        setCards((set?.cards ?? []).map((c) => ({ ...c, rarity: rarities?.get(c.id) ?? null })))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errorText(err, 'Loading the set failed.'))
        setCards([])
      })
    return () => {
      cancelled = true
    }
  }, [setId])

  const missing = useMemo(
    () => (cards ?? []).filter((c) => !owned.has(`en/${c.id}`) && !bought.has(`en/${c.id}`)).sort((a, b) => numberOf(a) - numberOf(b) || a.localId.localeCompare(b.localId)),
    [cards, owned, bought],
  )

  async function buy(c: SetCard): Promise<void> {
    if (busy) return
    const key = `en/${c.id}`
    setBusy(key)
    setError(null)
    try {
      const r = await craftCard(key)
      setBought((s) => new Set(s).add(key))
      setBalance(r.points)
      onBought(r.points)
    } catch (err) {
      setError(errorText(err, 'Buying the card failed.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet title={`Missing from ${setName}`} onClose={onClose}>
      <p className="muted small">
        Buy one card you do not have yet. You have {balance.toLocaleString('en-GB')} Crate points.
      </p>
      {server === false && <p className="notice">{CRATE_SERVER_MISSING}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {cards === null ? (
        <Loading />
      ) : missing.length === 0 ? (
        <p className="empty">{cards.length === 0 ? 'No cards found for this set.' : 'You have every card of this set.'}</p>
      ) : (
        <ul className="crate-missing">
          {missing.map((c) => {
            const cost = craftCost(rules, c.rarity)
            const key = `en/${c.id}`
            return (
              <li key={c.id}>
                <span className="crate-missing-img">
                  <CatalogKeyPicture cardKey={key} image={c.image} name={c.name} quality="low" alt="" fallback={<CardFace name={c.name} detail={`#${c.localId}`} />} />
                </span>
                <span className="crate-missing-text">
                  <strong>{c.name}</strong>
                  <span className="muted small">
                    #{c.localId} · <RaritySymbols rarity={c.rarity} /> {c.rarity ?? 'Unknown rarity'}
                  </span>
                </span>
                <button
                  type="button"
                  className="small-btn"
                  disabled={server !== true || cost === null || balance < cost || busy !== null}
                  onClick={() => void buy(c)}
                  aria-label={cost === null ? `${c.name} cannot be bought` : `Buy ${c.name} for ${cost} points`}
                >
                  {busy === key ? 'Buying…' : cost === null ? 'Not for sale' : `${cost} pts`}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small">Prices depend on rarity. Cards stay virtual, like every Crate card.</p>
    </Sheet>
  )
}
