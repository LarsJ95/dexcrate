import type { JSX } from 'react'
import type { GoalProgress, SplitProgress } from '../lib/goals'
import { PAGE_SIZES, pageSizeLabel, type Cost, type PageSize } from '../lib/setBinder'
import { SET_SORT_LABELS, type SetSort } from '../lib/setSort'
import { formatEur } from '../lib/stats'
import { closeKeyboardOnEnter } from '../lib/keyboard'
import { hpLevel } from '../lib/trainer'
import { IconSearch } from './Icons'
import { SearchClear } from './SearchClear'

export type BinderShow = 'all' | 'owned' | 'missing' | 'duplicates'

interface BinderToolbarProps {
  /** Zoeken op naam of nummer binnen de set. */
  query: string
  onQuery: (query: string) => void
  show: BinderShow
  onShow: (show: BinderShow) => void
  /** Aantal dubbelen; keuze "Duplicates" alleen als die er zijn (of al gekozen is). */
  duplicates: number
  pageSize: PageSize
  onPageSize: (size: PageSize) => void
  /** Map begint met de lege binnenkant van de kaft (pagina 1 rechts). */
  skipFirst: boolean
  onSkipFirst: (skip: boolean) => void
  sort: SetSort
  onSort: (sort: SetSort) => void
}

/** Tonen (alles/compleet/ontbrekend), vakken per pagina en sortering van de setbinder. */
export function BinderToolbar({ query, onQuery, show, onShow, duplicates, pageSize, onPageSize, skipFirst, onSkipFirst, sort, onSort }: BinderToolbarProps): JSX.Element {
  const options: [BinderShow, string][] = [
    ['all', 'All'],
    ['owned', 'Complete'],
    ['missing', 'Missing'],
  ]
  if (duplicates > 0 || show === 'duplicates') options.push(['duplicates', 'Duplicates'])
  return (
    <div className="filters">
      <div className="search">
        <IconSearch size={18} />
        <input
          type="search"
          placeholder="Search this set, e.g. Pikachu or 25"
          aria-label="Search this set"
          enterKeyHint="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={closeKeyboardOnEnter}
        />
        <SearchClear value={query} onClear={() => onQuery('')} />
      </div>
      <div className="segmented" role="group" aria-label="Show">
        {options.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={show === key} onClick={() => onShow(key)}>
            {label}
          </button>
        ))}
      </div>
      <select className="toolbar-sort" aria-label="Pockets per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value) as PageSize)}>
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {pageSizeLabel(size)} per page
          </option>
        ))}
      </select>
      <label className="check binder-skip">
        <input type="checkbox" checked={skipFirst} onChange={(e) => onSkipFirst(e.target.checked)} />
        Skip first page
      </label>
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

function SplitRow({ label, hint, part }: { label: string; hint: string; part: { done: number; total: number } }): JSX.Element {
  const ratio = part.total > 0 ? part.done / part.total : 0
  return (
    <div className="split-row">
      <span className="split-label" title={hint}>
        {label}
      </span>
      <span className="split-count">
        {part.done} of {part.total}
      </span>
      <div className="set-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={part.total} aria-valuenow={part.done}>
        <span data-hp={hpLevel(ratio)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/**
 * Setvoortgang zoals verzamelaars tellen (DEX-idee, 18-10-2026): officiële set, master set (elke uitvoering) en extra
 * kaarten (hogere nummers, TG …). Master: in één keer voor Engelse sets, anders pas na "Count".
 */
export function SetProgressSplit({
  split,
  masterLoading,
  onCountMaster,
}: {
  split: SplitProgress
  /** Uitvoeringen worden opgehaald: hoeveel kaarten al. */
  masterLoading: { done: number; total: number } | null
  /** Master set tellen (haalt de uitvoeringen per kaart op); null = gebeurt al vanzelf. */
  onCountMaster: (() => void) | null
}): JSX.Element {
  return (
    <section className="panel set-split" aria-label="Set progress">
      <SplitRow label="Official set" hint="Every card up to the printed set size, any version" part={split.official} />
      {split.master ? (
        <SplitRow label="Master set" hint="Every card in every version the catalog lists (normal, holo, reverse, 1st edition)" part={split.master} />
      ) : (
        <div className="split-row">
          <span className="split-label">Master set</span>
          {masterLoading ? (
            <span className="split-count muted">
              Checking versions… {masterLoading.done} of {masterLoading.total}
            </span>
          ) : onCountMaster ? (
            <button type="button" className="small-btn" onClick={onCountMaster}>
              Count master set
            </button>
          ) : (
            <span className="split-count muted">Checking versions…</span>
          )}
        </div>
      )}
      {split.extra.total > 0 && <SplitRow label="Extra cards" hint="Secret rares and other cards above the printed set size" part={split.extra} />}
    </section>
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
