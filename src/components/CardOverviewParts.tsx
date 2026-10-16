import { useState, type JSX } from 'react'
import { useKeyed } from '../hooks/useKeyed'
import { updateCard } from '../lib/db'
import { getEvolutionPaths } from '../lib/evolution'
import { spriteUrls } from '../lib/runner'
import { formatEur } from '../lib/stats'
import { getSet, type Lang } from '../lib/tcgdex'
import { regionOf } from '../lib/trainer'
import { VARIANT_LABELS, type Card, type Variant } from '../lib/types'
import { EvolutionRow } from './EvolutionPanel'

const loadPaths = (key: string): Promise<number[][]> => getEvolutionPaths(Number(key))
const loadSetTotal = async (key: string): Promise<number | null> => {
  const [lang, setId] = key.split('|')
  return (await getSet(lang as Lang, setId))?.summary.total ?? null
}
const pad = (n: number): string => String(n).padStart(4, '0')

/** Pokédex-strook: sprite, nummer, regio en de evolutielijn (wat je hebt in kleur). */
export function DexStrip({ dexId, name, ownedDex }: { dexId: number; name: string; ownedDex: ReadonlySet<number> }): JSX.Element {
  const paths = useKeyed(String(dexId), loadPaths)
  const region = regionOf(dexId)
  const line = paths?.find((p) => p.includes(dexId)) ?? null
  return (
    <section className="dex-strip" aria-label="Pokédex">
      <img className="dex-strip-sprite" src={spriteUrls(dexId, false)[1]} alt="" width={72} height={72} />
      <div className="dex-strip-info">
        <span className="dex-strip-num">#{pad(dexId)}</span>
        <strong>{name}</strong>
        {region && (
          <span className="muted small">
            {region.region} (generation {region.gen})
          </span>
        )}
      </div>
      {line && line.length > 1 && (
        <div className="dex-strip-evo">
          <span className="muted small">Evolution line</span>
          <EvolutionRow line={{ path: line }} owned={ownedDex} />
        </div>
      )}
    </section>
  )
}

/** Hoeveel kaarten uit deze set je hebt, met een link naar de setpagina. */
export function SetProgress({ lang, setId, setName, ownedKeys }: { lang: Lang; setId: string; setName: string; ownedKeys: readonly string[] }): JSX.Element | null {
  const total = useKeyed(`${lang}|${setId}`, loadSetTotal)
  if (!total) return null
  const prefix = `${lang}/${setId}-`
  const owned = new Set(ownedKeys.filter((k) => k.startsWith(prefix))).size
  const ratio = Math.min(1, owned / total)
  return (
    <a className="set-progress-link" href={`#/sets/${lang}/${encodeURIComponent(setId)}`}>
      <span className="set-progress-head">
        <span className="small">
          In {setName}: <strong>{owned}</strong> of {total}
        </span>
        <span className="small set-progress-open">Open set ›</span>
      </span>
      <span className="meter" aria-hidden="true">
        <span className="meter-fill" data-hp={ratio > 0.5 ? 'high' : ratio > 0.2 ? 'mid' : 'low'} style={{ width: `${ratio * 100}%` }} />
      </span>
    </a>
  )
}

/** Variant onbekend: duidelijke vraag met knoppen, want de variant bepaalt welke prijs telt. */
export function VariantQuestion({ card, options, onChanged }: { card: Card; options: Variant[] | null; onChanged: (row: Card) => void }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = options && options.length > 0 ? options : (Object.keys(VARIANT_LABELS) as Variant[])

  async function choose(variant: Variant): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      onChanged(await updateCard(card.id, { variant }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="variant-question notice" aria-labelledby={`variant-q-${card.id}`}>
      <strong id={`variant-q-${card.id}`}>Which version is yours?</strong>
      <span className="small">
        {list.length === 1
          ? `This card only exists as ${VARIANT_LABELS[list[0]]}. Confirm it so the right market price is used.`
          : 'The version decides which market price counts (a reverse holo can cost a lot more).'}
      </span>
      <span className="variant-options">
        {list.map((v) => (
          <button key={v} type="button" className="small-btn" onClick={() => void choose(v)} disabled={busy}>
            {VARIANT_LABELS[v]}
          </button>
        ))}
      </span>
      {error && (
        <span className="error small" role="alert">
          {error}
        </span>
      )}
    </section>
  )
}

/** Waarde tegenover wat je betaalde, als HP-balk: vol en groen = minstens terugverdiend. */
export function ValueBar({ paid, value, quantity, sold }: { paid: number; value: number; quantity: number; sold: boolean }): JSX.Element | null {
  if (paid <= 0) return null
  const ratio = value / paid
  const level = ratio >= 1 ? 'high' : ratio >= 0.75 ? 'mid' : 'low'
  const diff = (value - paid) * quantity
  const what = sold ? 'Sold for' : 'Worth'
  const text =
    ratio >= 1
      ? `${what} ${Math.round((ratio - 1) * 100)}% more than you paid`
      : `${what} ${Math.round(ratio * 100)}% of what you paid`
  return (
    <div className="value-bar">
      <span className="value-bar-head">
        <span className="small">{text}</span>
        <strong className={diff >= 0 ? 'up' : 'down'}>
          {diff >= 0 ? '+' : '−'}
          {formatEur(Math.abs(diff))}
        </strong>
      </span>
      <span
        className="meter"
        role="meter"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, ratio) * 100)}
      >
        <span className="meter-fill" data-hp={level} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      </span>
    </div>
  )
}
