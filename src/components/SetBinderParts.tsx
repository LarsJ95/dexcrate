import type { JSX } from 'react'
import type { GoalProgress } from '../lib/goals'
import type { Cost, PageSize } from '../lib/setBinder'
import { SET_SORT_LABELS, type SetSort } from '../lib/setSort'
import { formatEur } from '../lib/stats'

export type BinderShow = 'all' | 'owned' | 'missing' | 'duplicates'

interface BinderToolbarProps {
  show: BinderShow
  onShow: (show: BinderShow) => void
  /** Aantal dubbelen; keuze "Duplicates" alleen als die er zijn (of al gekozen is). */
  duplicates: number
  pageSize: PageSize
  onPageSize: (size: PageSize) => void
  sort: SetSort
  onSort: (sort: SetSort) => void
}

/** Tonen (alles/compleet/ontbrekend), vakken per pagina en sortering van de setbinder. */
export function BinderToolbar({ show, onShow, duplicates, pageSize, onPageSize, sort, onSort }: BinderToolbarProps): JSX.Element {
  const options: [BinderShow, string][] = [
    ['all', 'All'],
    ['owned', 'Complete'],
    ['missing', 'Missing'],
  ]
  if (duplicates > 0 || show === 'duplicates') options.push(['duplicates', 'Duplicates'])
  return (
    <div className="filters">
      <div className="segmented" role="group" aria-label="Show">
        {options.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={show === key} onClick={() => onShow(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Pockets per page">
        {([6, 9] as const).map((size) => (
          <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => onPageSize(size)}>
            {size} per page
          </button>
        ))}
      </div>
      <select className="toolbar-sort" aria-label="Sort" value={sort} onChange={(e) => onSort(e.target.value as SetSort)}>
        {(Object.keys(SET_SORT_LABELS) as SetSort[]).map((k) => (
          <option key={k} value={k}>
            {SET_SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Dubbelen, onderweg, onbekende uitvoering en het ophalen van uitvoeringen; niets te melden = niets tonen. */
export function GoalStats({
  progress,
  variantsLoading,
  onShowDuplicates,
}: {
  progress: GoalProgress
  variantsLoading: { done: number; total: number } | null
  /** Tik op Duplicates: alleen de kaarten met dubbelen tonen. */
  onShowDuplicates: () => void
}): JSX.Element | null {
  if (!(progress.duplicates > 0 || progress.ordered > 0 || progress.unknownVariant > 0 || variantsLoading)) return null
  return (
    <div className="stat-row">
      {progress.duplicates > 0 && (
        <button type="button" className="stat" onClick={onShowDuplicates}>
          <span className="stat-label">Duplicates</span>
          <span className="stat-value">{progress.duplicates}</span>
          <span className="stat-sub">More than you need for this goal · Show them</span>
        </button>
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
