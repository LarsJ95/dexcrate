import type { JSX } from 'react'
import type { GoalProgress } from '../lib/goals'
import type { Cost } from '../lib/setBinder'
import { formatEur } from '../lib/stats'

/** Dubbelen, onderweg, onbekende uitvoering en het ophalen van uitvoeringen; niets te melden = niets tonen. */
export function GoalStats({ progress, variantsLoading }: { progress: GoalProgress; variantsLoading: { done: number; total: number } | null }): JSX.Element | null {
  if (!(progress.duplicates > 0 || progress.ordered > 0 || progress.unknownVariant > 0 || variantsLoading)) return null
  return (
    <div className="stat-row">
      {progress.duplicates > 0 && (
        <div className="stat">
          <span className="stat-label">Duplicates</span>
          <span className="stat-value">{progress.duplicates}</span>
          <span className="stat-sub">More than you need for this goal</span>
        </div>
      )}
      {progress.ordered > 0 && (
        <div className="stat">
          <span className="stat-label">Incoming</span>
          <span className="stat-value">{progress.ordered}</span>
          <span className="stat-sub">Ordered, not counted yet</span>
        </div>
      )}
      {progress.unknownVariant > 0 && (
        <div className="stat">
          <span className="stat-label">Version unknown</span>
          <span className="stat-value">{progress.unknownVariant}</span>
          <span className="stat-sub">Set the variant on these cards to count them</span>
        </div>
      )}
      {variantsLoading && (
        <div className="stat">
          <span className="stat-label">Checking versions</span>
          <span className="stat-value">
            {variantsLoading.done} of {variantsLoading.total}
          </span>
          <span className="stat-sub">Which versions exist per card</span>
        </div>
      )}
    </div>
  )
}

interface CostPanelProps {
  missingCount: number
  /** 'cards' of 'versions' (doel per uitvoering). */
  unit: string
  cost: Cost | null
  costSummary: { amount: number; unknown: number } | null
  onCalculate: () => void
}

/** Kosten om het doel af te maken. */
export function CostPanel({ missingCount, unit, cost, costSummary, onCalculate }: CostPanelProps): JSX.Element {
  return (
    <div className="panel cost-panel">
      <div>
        <span className="stat-label">Cost to complete</span>
        {costSummary && cost ? (
          <>
            <p className="meter-value">
              {cost.running ? `${formatEur(costSummary.amount)}…` : formatEur(costSummary.amount)}
            </p>
            <p className="muted small">
              {cost.running
                ? `Fetching prices: ${cost.done} of ${cost.total}`
                : `${missingCount} missing ${unit}${costSummary.unknown > 0 ? `, ${costSummary.unknown} without price (not included)` : ''}`}
            </p>
          </>
        ) : (
          <p className="muted small">
            Market price of your {missingCount} missing {unit} (indicative).
          </p>
        )}
      </div>
      {!cost?.running && (
        <button type="button" className="primary" onClick={onCalculate}>
          {cost ? 'Recalculate' : 'Calculate'}
        </button>
      )}
    </div>
  )
}
