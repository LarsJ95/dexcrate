/** Welke sets de setlijst toont: alles, waarin je kaarten hebt, bijna compleet, compleet. */
export type SetScope = 'all' | 'owned' | 'almost' | 'complete'

/** Opgeslagen keuze; 'auto' = nog niets gekozen. */
export const STORED_SCOPES: readonly (SetScope | 'auto')[] = ['auto', 'all', 'owned', 'almost', 'complete']

/** Vanaf zoveel sets met kaarten opent de lijst op "Started". */
export const MIN_STARTED = 3

/**
 * Waarmee de setlijst opent (audit B1, 20-10-2026): je eigen keuze als je die ooit maakte; anders "Started" zodra je in
 * minstens 3 sets kaarten hebt (dan zoek je meestal een van je eigen sets), en anders alles.
 */
export function openingScope(stored: SetScope | 'auto', startedCount: number): SetScope {
  if (stored !== 'auto') return stored
  return startedCount >= MIN_STARTED ? 'owned' : 'all'
}
