import type { CSSProperties, JSX } from 'react'
import type { RequirementState } from '../lib/goals'
import { spriteUrls } from '../lib/runner'
import { VARIANT_SHORT, formatValue, stateKey, type Cost } from '../lib/setBinder'
import type { SetSort } from '../lib/setSort'
import { formatEur } from '../lib/stats'
import { isLang, type SetCard } from '../lib/tcgdex'
import { VARIANT_LABELS, type Variant } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogCardPicture } from './CatalogCardPicture'

interface Props {
  card: SetCard
  lang: string
  setId: string
  /** Aantal in bezit (elke uitvoering, incl. onderweg). */
  qty: number | undefined
  /** Vakjes van deze kaart in het doel; leeg = valt buiten het doel. */
  states: readonly RequirementState[]
  cost: Cost | null
  sort: SetSort
  values: { prices: ReadonlyMap<string, number | null> } | null
  /** Nieuw sinds het vorige bezoek: springt in zijn vak; index = volgorde van springen. */
  newIndex: number | null
  /** Pokédex-nummer voor het silhouet (Who's that Pokémon?), of null; alleen getoond zolang de kaart niet compleet is. */
  silhouette: number | null
  onOpen: (card: SetCard) => void
}

/** Eén vak in de setbinder. */
export function BinderSlot({ card: c, lang, setId, qty, states, cost, sort, values, newIndex, silhouette, onOpen }: Props): JSX.Element {
  const inGoal = states.length > 0
  const complete = inGoal && states.every((st) => st.missing === 0)
  // Prijs van wat er van deze kaart nog ontbreekt (alleen als alle prijzen bekend zijn).
  // undefined = (nog) niet berekend, null = minstens één prijs onbekend.
  let price: number | null | undefined
  if (cost && !complete) {
    let cents = 0
    let fetched = true
    let unknown = false
    for (const st of states) {
      if (st.missing === 0) continue
      const v = cost.prices.get(stateKey(st))
      if (v === undefined) fetched = false
      else if (v === null) unknown = true
      else cents += st.missing * Math.round(v * 100)
    }
    price = !fetched ? undefined : unknown ? null : cents / 100
  }
  const versioned = states.filter((st) => st.req.variant !== null)
  const dexId = complete ? null : silhouette
  const isNew = newIndex !== null
  return (
    <li
      className={`slot${complete ? ' have' : ' missing'}${inGoal ? '' : ' outside'}${isNew ? ' is-new' : ''}${dexId ? ' has-silhouette' : ''}`}
      style={isNew ? ({ '--pop-delay': `${newIndex * 120}ms` } as CSSProperties) : undefined}
    >
      <button
        type="button"
        className="slot-open"
        onClick={() => onOpen(c)}
        aria-label={`View ${c.name} #${c.localId}${complete ? '' : inGoal ? ' (missing)' : ' (not in goal)'}`}
      >
        {isLang(lang) ? (
          <CatalogCardPicture
            lang={lang}
            setId={setId}
            localId={c.localId}
            image={c.image}
            name={c.name}
            quality="low"
            alt={`${c.name} ${c.localId}`}
            fallback={<CardFace name={c.name} detail={`#${c.localId}`} />}
          />
        ) : (
          <CardFace name={c.name} detail={`#${c.localId}`} />
        )}
        {dexId && (
          <span className="whos-that" aria-hidden="true">
            <img className="whos-that-dark" src={spriteUrls(dexId, false)[1]} alt="" loading="lazy" />
            <img className="whos-that-color" src={spriteUrls(dexId, false)[1]} alt="" loading="lazy" />
          </span>
        )}
        <span className="slot-name" title={c.name}>
          {c.name}
        </span>
        <span className="slot-num">#{c.localId}</span>
        {versioned.length > 0 && (
          <span className="slot-variants">
            {versioned.map((st) => (
              <span
                key={st.req.variant}
                className={st.missing === 0 ? 'ok' : 'miss'}
                title={`${VARIANT_LABELS[st.req.variant as Variant]}: ${st.missing === 0 ? 'owned' : 'missing'}`}
              >
                {VARIANT_SHORT[st.req.variant as Variant]}
              </span>
            ))}
          </span>
        )}
        {sort === 'value'
          ? values?.prices.has(c.id) && <span className="slot-price">{formatValue(values.prices.get(c.id) ?? null)}</span>
          : !complete && inGoal && price !== undefined && <span className="slot-price">{price === null ? 'no price' : formatEur(price)}</span>}
        {qty && qty > 1 ? <span className="qty-badge">{qty}×</span> : null}
      </button>
    </li>
  )
}
