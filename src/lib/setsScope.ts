/** Welke sets de setlijst toont: alles, waarin je kaarten hebt, bijna compleet, compleet. */
export type SetScope = 'all' | 'owned' | 'almost' | 'complete'

/** Opgeslagen keuze; 'auto' = nog niets gekozen. */
export const STORED_SCOPES: readonly (SetScope | 'auto')[] = ['auto', 'all', 'owned', 'almost', 'complete']

/**
 * Waarmee de setlijst opent: je eigen keuze als je die maakte, anders alle sets (21-10-2026, op verzoek; was sinds
 * audit B1 "Started" vanaf 3 sets met kaarten).
 */
export function openingScope(stored: SetScope | 'auto'): SetScope {
  return stored === 'auto' ? 'all' : stored
}
