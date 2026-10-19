import type { JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useCardPrice } from '../hooks/useCardPrice'
import { formatEur } from '../lib/stats'
import { VARIANT_LABELS, type Variant } from '../lib/types'
import { variantOptions, variantPriceGap } from '../lib/variantChoice'

const isVariant = (v: string): v is Variant => Object.hasOwn(VARIANT_LABELS, v)

interface Props {
  /** Gekozen kaart; null = zonder koppeling (dan alle uitvoeringen). */
  cardKey: string | null
  value: Variant | null
  onChange: (v: Variant | null) => void
  label: string
}

/**
 * Uitvoering van een gescande kaart: alleen wat volgens de catalogus bestaat (een afwijkende huidige waarde blijft
 * zichtbaar, met "not in catalog"); bij een prijsverschil tussen gewoon en reverse holo staat de prijs erbij.
 */
export function VariantSelect({ cardKey, value, onChange, label }: Props): JSX.Element {
  const info = useCardInfo(cardKey)
  const price = useCardPrice(cardKey)
  const allowed = info?.variants ?? null
  const options = variantOptions(allowed)
  const keys = value && !options.includes(value) ? [...options, value] : options
  const gap = variantPriceGap(price, allowed)
  const priceOf = (v: Variant): number | null => (!gap ? null : v === 'reverse' ? gap.reverseValue : v === gap.base ? gap.baseValue : null)
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(isVariant(e.target.value) ? e.target.value : null)}>
      <option value="">Variant unknown</option>
      {keys.map((v) => {
        const p = priceOf(v)
        return (
          <option key={v} value={v}>
            {VARIANT_LABELS[v]}
            {p !== null ? ` · ${formatEur(p)}` : ''}
            {allowed && !allowed.includes(v) ? ' (not in catalog)' : ''}
          </option>
        )
      })}
    </select>
  )
}

/** Melding als de uitvoering de prijs flink verandert (bv. Dragonite: holo €0,74, reverse holo €3,08). */
export function VariantGapNote({ cardKey }: { cardKey: string | null }): JSX.Element | null {
  const info = useCardInfo(cardKey)
  const price = useCardPrice(cardKey)
  const gap = variantPriceGap(price, info?.variants ?? null)
  if (!gap) return null
  return (
    <p className="queue-why small">
      Version matters: {VARIANT_LABELS[gap.base]} {formatEur(gap.baseValue)}, Reverse holo {formatEur(gap.reverseValue)}. Check which one you have.
    </p>
  )
}
