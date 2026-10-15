import { hasSchemaV2 } from '../lib/db'
import { useDbFeature } from './useDbFeature'

/** True als STAP4 in de database staat; undefined zolang dat nog gecontroleerd wordt. */
export function useSchemaV2(): boolean | undefined {
  return useDbFeature(hasSchemaV2)
}
