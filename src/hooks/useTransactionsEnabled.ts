import { hasTransactions } from '../lib/transactions'
import { useDbFeature } from './useDbFeature'

/** True als STAP5 (transacties) in de database staat; undefined zolang dat gecontroleerd wordt. */
export function useTransactionsEnabled(): boolean | undefined {
  return useDbFeature(hasTransactions)
}
