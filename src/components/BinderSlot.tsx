import type { CSSProperties, JSX } from 'react'
import type { RequirementState } from '../lib/goals'
import { VARIANT_SHORT, formatValue, stateKey, type Cost } from '../lib/setBinder'
import { isValueSort, type SetSort } from '../lib/setSort'
import { formatEur } from '../lib/stats'
import { isLang, type SetCard } from '../lib/tcgdex'
import { VARIANT_LABELS, type Variant } from '../lib/types'
import { CardFace } from './CardFace'
import { CatalogCardPicture } from './CatalogCardPicture'
import { IconCheck } from './Icons'
import { LazyCardPrice } from './LazyCardPrice'

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
  onOpen: (card: SetCard) => void
  /** Aan het selecteren: of deze kaart gekozen is; undefined = niet aan het selecteren (tikken opent de kaart). */
  selected?: boolean
}

/** Eén vak in de setbinder. */
export function BinderSlot({ card: c, lang, setId, qty, states, cost, sort, values, newIndex, onOpen, selected }: Props): JSX.Element {
  const selecting = selected !== undefined
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
  const isNew = newIndex !== null
  return (
    <li
      className={`slot${complete ? ' have' : ' missing'}${inGoal ? '' : ' outside'}${isNew ? ' is-new' : ''}${selected ? ' is-selected' : ''}`}
      style={isNew ? ({ '--pop-delay': `${newIndex * 120}ms` } as CSSProperties) : undefined}
    >
      <button
        type="button"
        className="slot-open"
        onClick={() => onOpen(c)}
        aria-pressed={selecting ? selected : undefined}
        aria-label={`${selecting ? 'Select' : 'View'} ${c.name} #${c.localId}${complete ? '' : inGoal ? ' (missing)' : ' (not in goal)'}`}
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
        {/* Prijs onder elke kaart: bij sorteren op waarde de geladen waarde; na "kosten berekenen" wat er van deze kaart
            ontbreekt; anders de Cardmarket-marktprijs, opgehaald zodra de kaart in beeld komt. */}
        {isValueSort(sort) ? (
          values?.prices.has(c.id) && <span className="slot-price">{formatValue(values.prices.get(c.id) ?? null)}</span>
        ) : !complete && inGoal && price !== undefined ? (
          <span className="slot-price">{price === null ? 'no price' : formatEur(price)}</span>
        ) : isLang(lang) ? (
          <LazyCardPrice cardKey={`${lang}/${c.id}`} className="slot-price" withReverse />
        ) : null}
        {qty && qty > 1 ? <span className="qty-badge">{qty}×</span> : null}
        {selected && (
          <span className="select-badge" aria-hidden="true">
            <IconCheck size={18} />
          </span>
        )}
      </button>
    </li>
  )
}
