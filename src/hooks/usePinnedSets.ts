import { useSyncExternalStore } from 'react'
import { loadPinned, savePinned, withPin, type PinnedSet } from '../lib/pinnedSets'
import { supabase } from '../lib/supabase'

/** Vastgezette sets, gedeeld door het menu, de setpagina en de Sets-pagina (één keer laden per sessie). */
const NONE: PinnedSet[] = []
let state: PinnedSet[] = NONE
let loading: Promise<void> | null = null
let watchingAuth = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function ensureLoaded(): void {
  if (!watchingAuth) {
    watchingAuth = true
    // Uitloggen: niet de sets van de vorige gebruiker laten staan.
    supabase.auth?.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      state = NONE
      loading = null
      emit()
    })
  }
  loading ??= loadPinned()
    .then((list) => {
      state = list
      emit()
    })
    .catch((err: unknown) => {
      loading = null // volgende keer opnieuw
      console.warn('Vastgezette sets laden mislukt', err)
    })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  ensureLoaded()
  return () => listeners.delete(listener)
}

export function usePinnedSets(): PinnedSet[] {
  return useSyncExternalStore(subscribe, () => state, () => NONE)
}

/** Set (los)maken; meteen zichtbaar, bij een fout terug zoals het was (en de fout gaat door). */
export async function setPinned(set: PinnedSet, on: boolean): Promise<void> {
  const before = state
  const next = withPin(state, set, on)
  if (next.length === state.length && next.every((p, i) => p === state[i])) return
  state = next
  emit()
  try {
    await savePinned(next)
  } catch (err) {
    state = before
    emit()
    throw err
  }
}
